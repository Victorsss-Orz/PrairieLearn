import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.js';
import { compiledScriptTag } from '../../../lib/assets.js';
import { type Institution, type Lti13Instance } from '../../../lib/db-types.js';

import { type LTI13InstancePlatforms } from './administratorInstitutionLti13.types.js';

export function AdministratorInstitutionLti13({
  institution,
  lti13Instances,
  instance,
  resLocals,
  platform_defaults,
  canonicalHost,
}: {
  institution: Institution;
  lti13Instances: Lti13Instance[];
  instance: Lti13Instance | null;
  resLocals: Record<string, any>;
  platform_defaults: LTI13InstancePlatforms;
  canonicalHost: string;
}): string {
  return PageLayout({
    resLocals: {
      ...resLocals,
      institution,
    },
    pageTitle: 'LTI 1.3 - Institution Admin',
    headContent: compiledScriptTag('administratorInstitutionLti13Client.ts'),
    navContext: {
      type: 'administrator_institution',
      page: 'administrator_institution',
      subPage: 'lti13',
    },
    content: html`
      <h2 class="h4">LTI 1.3 / Learning Tools Interoperability</h2>
      <p>${lti13Instances.length} instance${lti13Instances.length === 1 ? '' : 's'} configured.</p>
      <hr />

      <div class="row">
        <div class="col-3">
          ${lti13Instances.length > 0 ? 'Please select an instance:' : ''}

          <nav class="nav nav-pills flex-column">
            ${lti13Instances.map((i) => {
              return html`
                <a class="nav-link ${i.id === instance?.id ? 'active' : ''}" href="${i.id}">
                  <span style="white-space: nowrap"> ${i.name ? i.name : `#${i.id}`} </span>
                  <span style="white-space: nowrap">(${i.platform})</span>
                </a>
              `;
            })}
          </nav>
          <form method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button
              class="btn btn-outline-success d-block w-100 my-4"
              type="submit"
              name="__action"
              value="add_instance"
            >
              Add a new LTI 1.3 instance
            </button>
          </form>
        </div>

        <div class="col-9">
          ${LTI13Instance(instance, resLocals, platform_defaults, canonicalHost)}
        </div>
      </div>
    `,
  });
}

function LTI13Instance(
  instance: Lti13Instance | null,
  resLocals: Record<string, any>,
  platform_defaults: LTI13InstancePlatforms,
  canonicalHost: string,
) {
  if (instance) {
    return html`
      <h3>${instance.name} (ID #${instance.id})</h3>
      <p>
        Created at ${instance.created_at.toString()}
        <button
          class="btn btn-sm btn-secondary"
          type="button"
          data-bs-toggle="modal"
          data-bs-target="#instanceData"
        >
          <i class="fa-solid fa-screwdriver-wrench"></i> Show details
        </button>
      </p>

      <div class="modal fade" id="instanceData" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">LTI 1.3 instance data</h5>
              <button
                type="button"
                class="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div class="modal-body">
              <pre><code>${JSON.stringify(instance, null, 1)}</code></pre>
            </div>
          </div>
        </div>
      </div>

      <p>
        <a href="${canonicalHost}/pl/lti13_instance/${instance.id}/config"
          >LTI 1.3 config for instance</a
        >
        |
        <a href="${canonicalHost}/pl/lti13_instance/${instance.id}/jwks">JWKS keystore link</a>
        (${instance.keystore?.keys ? instance.keystore.keys.length : 0}
        key${instance.keystore?.keys?.length === 1 ? '' : 's'})
      </p>

      <hr />
      <h5>Name:</h5>
      ${instance.tool_platform_name
        ? html` The LMS has referred to itself as:
            <strong>${instance.tool_platform_name}</strong>`
        : ''}
      <form class="form" method="POST">
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <input type="hidden" name="__action" value="update_name" />
        <div class="mb-3 my-2">
          <label for="name" class="form-label">Branded platform name: </label>
          <input
            id="name"
            class="form-control"
            type="text"
            size="80"
            spellcheck="false"
            name="name"
            value="${instance.name}"
            aria-describedby="nameHelp"
          />
          <small id="nameHelp" class="form-text text-muted">
            Use this name inside PL to refer to the LMS, i.e. whatever your institution calls it
          </small>
        </div>
        <button type="submit" class="btn btn-info">Save name</button>
        <input type="reset" class="btn btn-secondary" value="Reset options" />
      </form>

      <hr />
      <h5>Platform:</h5>

      ${EncodedData(platform_defaults, 'platform_defaults_data')}

      <form class="form" method="POST">
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <input type="hidden" name="__action" value="update_platform" />

        <div class="mb-3">
          <label class="form-label" for="choosePlatform">Platform type: </label>
          <select class="form-select mb-2" id="choosePlatform" name="platform">
            ${platform_defaults.map((d) => {
              return html`<option ${d.platform === instance.platform ? 'selected' : ''}>
                ${d.platform}
              </option>`;
            })}
          </select>

          <div class="form-check form-check-inline">
            <label class="form-check-label">
              <input
                id="update_params"
                class="form-check-input"
                type="checkbox"
                name="platform_update"
                value="1"
                checked
              />
              On change, load defaults into form&nbsp;<em>(remember to edit and save!)</em>
            </label>
          </div>
        </div>

        <div class="mb-3 mt-2">
          <label for="issuer_params"> Issuer params: </label>
          <textarea
            class="form-control"
            id="issuer_params"
            name="issuer_params"
            rows="8"
            spellcheck="false"
          >
${JSON.stringify(instance.issuer_params, null, 3)}</textarea
          >
        </div>

        <div class="mb-3 mt-2">
          <label for="client_id">Client ID: </label>
          <input
            id="client_id"
            class="form-control"
            type="text"
            spellcheck="false"
            name="client_id"
            value="${instance.client_params?.client_id}"
            aria-describedby="client_idHelp"
          />
          <small id="client_idHelp" class="form-text text-muted">
            Get this unique ID from the LMS.
          </small>
        </div>

        <div class="mb-3 mt-2">
          <label for="custom_fields">Custom fields suggestions: </label>
          <textarea
            class="form-control"
            id="custom_fields"
            name="custom_fields"
            rows="4"
            spellcheck="false"
          >
${JSON.stringify(instance.custom_fields, null, 3)}</textarea
          >
          <small id="custom_fieldsHelp" class="form-text text-muted">
            Provide suggestions to the LMS in the config JSON for how to setup LTI 1.3 custom
            fields.
            <a
              href="https://canvas.instructure.com/doc/api/file.tools_variable_substitutions.html"
              target="_blank"
              rel="noreferrer"
              >Canvas variable substitution docs</a
            >
          </small>
        </div>

        <div class="mb-3">
          <button type="submit" class="btn btn-info">Save platform options</button>
          <input type="reset" class="btn btn-secondary" value="Reset options" />
        </div>
      </form>

      <hr />
      <h5>Keystore:</h5>

      <a href="${canonicalHost}/pl/lti13_instance/${instance.id}/jwks">JWKS keystore</a>
      contains ${instance.keystore?.keys ? instance.keystore.keys.length : 0}
      key${instance.keystore?.keys?.length === 1 ? '' : 's'}.<br />
      <ul>
        ${instance.keystore?.keys?.map((k) => {
          return html`<li>
            <form method="POST">
              <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
              <input type="hidden" name="__action" value="delete_key" />
              <input type="hidden" name="kid" value="${k.kid}" />
              ${k.kid}
              <input
                class="btn btn-xs btn-outline-warning"
                type="submit"
                value="Delete key"
                onclick="return confirm('Really delete this key: ${k.kid}?')"
              />
            </form>
          </li>`;
        })}
      </ul>
      <form method="POST">
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <button type="submit" name="__action" value="add_key" class="btn btn-success">
          Add key to keystore
        </button>
        <button
          type="submit"
          name="__action"
          value="delete_keys"
          class="btn btn-warning"
          onclick="return confirm('Really delete all keys from keystore?')"
        >
          Delete all keys from keystore
        </button>
      </form>

      <hr />
      <h5>PrairieLearn configuration</h5>

      <form method="POST">
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <input type="hidden" name="__action" value="save_pl_config" />

        <h6>Which attributes from the LTI 1.3 user claim should be mapped to PL identities?</h6>
        <div class="mb-3">
          <label class="form-label" for="name_attribute">Name attribute</label>
          <input
            type="text"
            class="form-control"
            name="name_attribute"
            id="name_attribute"
            value="${instance.name_attribute}"
            aria-describedby="nameAttributeHelp"
          />
          <small id="nameAttributeHelp" class="form-text text-muted">
            This attribute should contain the full name of the user, like "Jasmine Wang".
          </small>
        </div>

        <div class="mb-3">
          <label class="form-label" for="name_attribute">UID attribute</label>
          <input
            type="text"
            class="form-control"
            name="uid_attribute"
            id="uid_attribute"
            value="${instance.uid_attribute}"
            aria-describedby="uidAttributeHelp"
          />
          <small id="uidAttributeHelp" class="form-text text-muted">
            The UID is a user-facing identifier for the user. This should generally be an email-like
            identifier, like "jwang@example.com". However, it doesn't have to be an email address;
            PrairieLearn will never try to route email to it. This attribute may change, for
            instance if a student changes their name with their university.
          </small>
        </div>

        <div class="mb-3">
          <label class="form-label" for="name_attribute">UIN attribute</label>
          <input
            type="text"
            class="form-control"
            name="uin_attribute"
            id="uin_attribute"
            value="${instance.uin_attribute}"
            aria-describedby="uinAttributeHelp"
          />
          <small id="uinAttributeHelp" class="form-text text-muted">
            The UIN is used as an internal, immutable identifier for the user. It
            <strong>MUST</strong> never change for a given individual, even if they change their
            name or UID. Possibly
            <code>["https://purl.imsglobal.org/spec/lti/claim/lis"]["person_sourcedid"]</code> or
            <code>["https://purl.imsglobal.org/spec/lti/claim/custom"]["uin"]</code>
          </small>
        </div>

        <div class="mb-3">
          <label class="form-label" for="email_attribute">Email attribute</label>
          <input
            type="text"
            class="form-control"
            name="email_attribute"
            id="email_attribute"
            value="${instance.email_attribute}"
            aria-describedby="emailAttributeHelp"
          />
          <small id="emailAttributeHelp" class="form-text text-muted">
            This attribute should contain the email address of the user. If present, PrairieLearn
            will use this to send email to the user.
          </small>
        </div>

        <div class="mb-3 form-check">
          <input
            type="checkbox"
            class="form-check-input"
            name="require_linked_lti_user"
            id="require_linked_lti_user"
            value="true"
            aria-describedby="requireLtiUserHelp"
            ${instance.require_linked_lti_user ? 'checked' : ''}
          />
          <label class="form-check-label" for="require_linked_lti_user">
            Require LTI authentication
          </label>
          <small id="requireLtiUserHelp" class="form-text text-muted d-block">
            When enabled, students who authenticate via a non-LTI provider will be required to
            authenticate via the LTI platform before they can access any course instances linked to
            this LTI instance. This should not be enabled in most cases. It is primarily useful for
            institutions that don't provide UIDs or useful emails to PrairieLearn via LTI.
          </small>
        </div>

        <button type="submit" class="btn btn-info">Save PrairieLearn config</button>
      </form>

      <hr />
      <p>
        For testing, have the LMS admin configure their OpenID Connect Initiation URL to
        <a href="${canonicalHost}/pl/lti13_instance/${instance.id}/auth/login?test">
          ${canonicalHost}/pl/lti13_instance/${instance.id}/auth/login?test
        </a>
      </p>

      <form method="POST">
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <input type="hidden" name="__action" value="remove_instance" />
        <button
          type="submit"
          class="btn btn-danger my-2"
          onclick="return confirm('Really delete this LTI 1.3 instance?')"
        >
          Remove LTI 1.3 instance
        </button>
      </form>
    `;
  } else {
    return html`Please select an instance on the left.`;
  }
}
