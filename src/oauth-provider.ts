// In-memory OAuth 2.1 + DCR provider for the asc-mcp HTTP server.
//
// Designed for the single-tenant deployment model: one operator (you)
// connects one upstream MCP client (claude.ai). The provider supports:
//   - Dynamic Client Registration (RFC 7591)
//   - Authorization Code Grant with PKCE (RFC 7636)
//   - Refresh Token Grant
//   - Token Revocation (RFC 7009)
//
// Storage is in-memory — process restart wipes clients/codes/tokens. This
// is acceptable because claude.ai re-registers automatically on cache
// miss and issues a fresh approval flow when the token expires/refresh
// fails. For a multi-user or HA deployment this would need persistent
// storage (sqlite/postgres).
//
// `/authorize` auto-approves any registered client because there is no
// human user model — the only authenticated entity is the operator who
// already owns the host. This trades classic OAuth user consent for
// pre-deploy network-level trust (the host runs YOUR code on YOUR VPS).

import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Response } from 'express';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

interface StoredAuthCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
}

interface StoredAccessToken {
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: string;
}

interface StoredRefreshToken {
  clientId: string;
  scopes: string[];
  resource?: string;
}

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h
const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10m
const TOKEN_BYTES = 32;

class ClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): OAuthClientInformationFull {
    const clientId = randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    // Confidential client: issue a secret. Public clients (token_endpoint_auth_method=none)
    // get no secret.
    const isConfidential =
      (client.token_endpoint_auth_method ?? 'client_secret_basic') !== 'none';
    const clientSecret = isConfidential
      ? randomBytes(TOKEN_BYTES).toString('hex')
      : undefined;

    const stored: OAuthClientInformationFull = {
      ...client,
      client_id: clientId,
      client_id_issued_at: issuedAt,
      client_secret: clientSecret,
      // Secret never expires (single-tenant). Spec: 0 means "does not expire".
      client_secret_expires_at: clientSecret ? 0 : undefined,
    };
    this.clients.set(clientId, stored);
    return stored;
  }
}

export class InMemoryOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new ClientsStore();

  private authCodes = new Map<string, StoredAuthCode>();
  private accessTokens = new Map<string, StoredAccessToken>();
  private refreshTokens = new Map<string, StoredRefreshToken>();

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    // Auto-approve. See file header for the trust model.
    const redirectUri = params.redirectUri;
    if (!client.redirect_uris.includes(redirectUri)) {
      const url = new URL(redirectUri);
      url.searchParams.set('error', 'invalid_redirect_uri');
      res.redirect(url.toString());
      return;
    }

    const code = randomBytes(TOKEN_BYTES).toString('hex');
    this.authCodes.set(code, {
      clientId: client.client_id,
      redirectUri,
      codeChallenge: params.codeChallenge,
      scopes: params.scopes ?? [],
      resource: params.resource?.toString(),
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });

    const url = new URL(redirectUri);
    url.searchParams.set('code', code);
    if (params.state) url.searchParams.set('state', params.state);
    res.redirect(url.toString());
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored || stored.clientId !== client.client_id) {
      throw new Error('invalid_grant');
    }
    if (stored.expiresAt < Date.now()) {
      this.authCodes.delete(authorizationCode);
      throw new Error('invalid_grant');
    }
    return stored.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored || stored.clientId !== client.client_id) {
      throw new Error('invalid_grant');
    }
    if (stored.expiresAt < Date.now()) {
      this.authCodes.delete(authorizationCode);
      throw new Error('invalid_grant');
    }
    if (redirectUri && stored.redirectUri !== redirectUri) {
      throw new Error('invalid_grant');
    }
    // PKCE validation handled by SDK before this is called.
    this.authCodes.delete(authorizationCode);

    return this.issueTokens(client.client_id, stored.scopes, stored.resource);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const stored = this.refreshTokens.get(refreshToken);
    if (!stored || stored.clientId !== client.client_id) {
      throw new Error('invalid_grant');
    }
    // Refresh rotates the refresh token (RFC 6749 Section 6 best practice).
    this.refreshTokens.delete(refreshToken);
    const finalScopes = scopes ?? stored.scopes;
    return this.issueTokens(client.client_id, finalScopes, stored.resource);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = this.accessTokens.get(token);
    if (!stored) {
      throw new Error('invalid_token');
    }
    if (stored.expiresAt < Date.now()) {
      this.accessTokens.delete(token);
      throw new Error('invalid_token');
    }
    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: Math.floor(stored.expiresAt / 1000),
      ...(stored.resource ? { resource: new URL(stored.resource) } : {}),
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    // RFC 7009: silently succeed even if the token is unknown. We only
    // delete tokens that actually belong to the requesting client.
    const token = request.token;
    const access = this.accessTokens.get(token);
    if (access && access.clientId === client.client_id) {
      this.accessTokens.delete(token);
    }
    const refresh = this.refreshTokens.get(token);
    if (refresh && refresh.clientId === client.client_id) {
      this.refreshTokens.delete(token);
    }
  }

  // Periodic cleanup of expired entries (mounted from index.ts on a setInterval).
  pruneExpired(): void {
    const now = Date.now();
    for (const [code, value] of this.authCodes) {
      if (value.expiresAt < now) this.authCodes.delete(code);
    }
    for (const [token, value] of this.accessTokens) {
      if (value.expiresAt < now) this.accessTokens.delete(token);
    }
  }

  // ---- internal helpers ----

  private issueTokens(
    clientId: string,
    scopes: string[],
    resource?: string,
  ): OAuthTokens {
    const accessToken = randomBytes(TOKEN_BYTES).toString('hex');
    const refreshToken = randomBytes(TOKEN_BYTES).toString('hex');
    const now = Date.now();

    this.accessTokens.set(accessToken, {
      clientId,
      scopes,
      expiresAt: now + ACCESS_TOKEN_TTL_MS,
      resource,
    });
    this.refreshTokens.set(refreshToken, {
      clientId,
      scopes,
      resource,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope: scopes.join(' '),
    };
  }
}

// Helper for tests: SHA-256 of a code verifier (PKCE S256 method).
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
