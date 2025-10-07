# Photo-to-Relief Urn Designer (Starter)

A minimal, working starter for a user-friendly app that:
- uploads a photo,
- previews a bas-relief on one of three urns,
- collects name/address,
- is structured to add payments and HQ mesh generation.

## Quick Start
1. Ensure Node 18+ is installed.
2. Copy `.env.example` to `.env.local` and set values as needed.
3. Install deps:
   ```bash
   npm install
   npm run dev
   ```
4. Open http://localhost:3000

### Running lint

`npm run lint` executes `next lint` using the shared configuration in
`.eslintrc.cjs`. If `eslint-config-next` is available locally the config extends
`next/core-web-vitals`; otherwise it falls back to `eslint:recommended` and
skips TypeScript sources so the command stays non-interactive in CI.

## What Works Now
- 3-step wizard
- STL urn loading (placeholder shapes)
- Client-side displacement preview using your image (fast!)
- Contact form to `/api/submit`

## What To Add Next
- **Stripe**: Add real checkout with Stripe Checkout and a success webhook.
- **Backend storage**: Postgres + S3 for images and final files.
- **Workers**: Implement HQ bas-relief + boolean union (see `worker/hq_job_stub.py`).

## Urn Files & Target Area
Urns live in `public/urns` and basic metadata in `lib/urns/urns.json`.
- `urn_classic.stl`: flat-front box
- `urn_rounded.stl`: shallower box
- `urn_column.stl`: cylinder

## Printing
The preview is visual only; final STL generation should run in a worker to ensure:
- watertight mesh
- min wall thickness
- chamfered relief edge

## License
For your business use; no warranty.
