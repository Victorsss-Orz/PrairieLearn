import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import * as authLib from '../../lib/authn.js';
import { config } from '../../lib/config.js';
import { AuthnProviderSchema } from '../../lib/db-types.js';

import {
  AuthLogin,
  AuthLoginInstitution,
  type InstitutionAuthnProvider,
} from './authLogin.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router();

const InstitutionAuthnProviderSchema = z.object({
  id: z.string(),
  long_name: z.string(),
  short_name: z.string(),
  default_authn_provider_name: z.string(),
});
const InstitutionSupportedProvidersSchema = z.object({
  name: AuthnProviderSchema.shape.name,
  is_default: z.boolean(),
});
const ServiceSchema = z.string().nullable();
const InstitutionIdSchema = z.string().nullable();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const service = ServiceSchema.parse(req.query.service ?? null);

    // If an `institution_id` query parameter is provided, we'll only show the
    // login options for that institution.
    const institutionId = InstitutionIdSchema.parse(req.query.institution_id ?? null);
    if (institutionId) {
      // Look up the supported providers for this institution.
      const supportedProviders = await queryRows(
        sql.select_supported_providers_for_institution,
        { institution_id: institutionId },
        InstitutionSupportedProvidersSchema,
      );

      res.send(
        AuthLoginInstitution({
          showUnsupportedMessage: req.query.unsupported_provider === 'true',
          institutionId,
          supportedProviders,
          service,
          resLocals: res.locals,
        }),
      );
      return;
    }

    const institutionAuthnProvidersRes = await queryRows(
      sql.select_institution_authn_providers,
      InstitutionAuthnProviderSchema,
    );
    const institutionAuthnProviders = institutionAuthnProvidersRes
      .map((provider) => {
        // Special case: omit the default institution in production.
        if (provider.id === '1' && config.devMode === false) return null;

        let url: string | null = null;
        switch (provider.default_authn_provider_name) {
          case 'SAML':
            url = `/pl/auth/institution/${provider.id}/saml/login`;
            break;
          case 'Google':
            url = '/pl/oauth2login';
            break;
          case 'Azure':
            url = '/pl/azure_login';
            break;
          case 'Shibboleth':
            url = '/pl/shibcallback';
            break;
          default:
            return null;
        }

        return {
          name:
            provider.long_name !== provider.short_name
              ? `${provider.long_name} (${provider.short_name})`
              : provider.long_name,
          url,
        };
      })
      .filter((provider): provider is InstitutionAuthnProvider => provider !== null);

    res.send(AuthLogin({ service, institutionAuthnProviders, resLocals: res.locals }));
  }),
);

const DevLoginParamsSchema = z.object({
  uid: z.string().min(1),
  name: z.string().min(1),
  uin: z.string().nullable().optional().default(null),
  email: z.string().nullable().optional().default(null),
});

router.post(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (!config.devMode) {
      throw new error.HttpStatusError(404, 'Not Found');
    }

    if (req.body.__action === 'dev_login') {
      const body = DevLoginParamsSchema.parse(req.body);

      const authnParams = {
        uid: body.uid,
        name: body.name,
        uin: body.uin || null,
        email: body.email || null,
        provider: 'dev',
      };

      await authLib.loadUser(req, res, authnParams, {
        redirect: true,
      });
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
