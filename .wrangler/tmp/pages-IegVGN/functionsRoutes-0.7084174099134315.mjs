import { onRequestOptions as __api_create_checkout_js_onRequestOptions } from "/Users/ferko/Projects/portretne-filmy/functions/api/create-checkout.js"
import { onRequestPost as __api_create_checkout_js_onRequestPost } from "/Users/ferko/Projects/portretne-filmy/functions/api/create-checkout.js"
import { onRequestOptions as __api_form_submit_js_onRequestOptions } from "/Users/ferko/Projects/portretne-filmy/functions/api/form-submit.js"
import { onRequestPost as __api_form_submit_js_onRequestPost } from "/Users/ferko/Projects/portretne-filmy/functions/api/form-submit.js"
import { onRequestOptions as __api_send_email_js_onRequestOptions } from "/Users/ferko/Projects/portretne-filmy/functions/api/send-email.js"
import { onRequestPost as __api_send_email_js_onRequestPost } from "/Users/ferko/Projects/portretne-filmy/functions/api/send-email.js"
import { onRequestPost as __api_stripe_webhook_js_onRequestPost } from "/Users/ferko/Projects/portretne-filmy/functions/api/stripe-webhook.js"
import { onRequest as __domain_check_js_onRequest } from "/Users/ferko/Projects/portretne-filmy/functions/domain-check.js"
import { onRequest as __ico_lookup_js_onRequest } from "/Users/ferko/Projects/portretne-filmy/functions/ico-lookup.js"

export const routes = [
    {
      routePath: "/api/create-checkout",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_create_checkout_js_onRequestOptions],
    },
  {
      routePath: "/api/create-checkout",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_create_checkout_js_onRequestPost],
    },
  {
      routePath: "/api/form-submit",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_form_submit_js_onRequestOptions],
    },
  {
      routePath: "/api/form-submit",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_form_submit_js_onRequestPost],
    },
  {
      routePath: "/api/send-email",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_send_email_js_onRequestOptions],
    },
  {
      routePath: "/api/send-email",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_send_email_js_onRequestPost],
    },
  {
      routePath: "/api/stripe-webhook",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_stripe_webhook_js_onRequestPost],
    },
  {
      routePath: "/domain-check",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__domain_check_js_onRequest],
    },
  {
      routePath: "/ico-lookup",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__ico_lookup_js_onRequest],
    },
  ]