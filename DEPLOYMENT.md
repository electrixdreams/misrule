# Misrule Deployment

Use this checklist for a Vercel-hosted judge deployment. Do not place secrets in source.

## Environment

```text
MISRULE_PROVIDER=openrouter
MISRULE_API_ENDPOINT=https://openrouter.ai/api/v1
MISRULE_MODEL=google/gemini-2.5-flash
MISRULE_OUTPUT_TRANSPORT=json_object
MISRULE_AUDIT_MODE=live
MISRULE_RUNTIME_MODE=locked
MISRULE_ALLOWED_PROVIDER_HOSTS=openrouter.ai
OPENROUTER_API_KEY=<secret>
MISRULE_EVIDENCE_DIR unset
```

## Vercel Runtime

- Enable Fluid Compute for the Vercel project.
- Ensure the project plan and function settings support the configured audit route duration: `app/api/audit/route.ts` exports `maxDuration = 120`.
- The 120 second duration covers two sequential model stages that may each consume up to 60 seconds.

## Operator Controls

- Set a provider spend cap before sharing the deployment.
- Enable platform-level rate limiting or bot protection.
- Record the deployed commit SHA before submission assembly.
- Run one post-deploy judge-path smoke from World Library to bundled sample to live audit to cited finding.
- Keep secrets out of source, browser storage, public responses, and logs.
- Do not claim that a module-local in-memory limiter protects a multi-instance serverless deployment.

## Submission Notes

Insert the hosted URL and deployment receipt only after the operator verifies the live deployment. Do not claim a provider proof or submission receipt before it exists.
