# Building Greening deployment

Published on 2026-10-09 to the user-owned Vercel team `zykll18s-projects`.

- Shareable website: https://hack4sdg-building-greening.vercel.app/
- Project dashboard: https://vercel.com/zykll18s-projects/hack4sdg-building-greening
- Project ID: `prj_9sy2DEiqWpUlycBPhnAjFyLTpXCR`
- Source branch: `bim/ifc-import`
- Deployed source commit: `76c9350096020284f0430d5a13f32b708e2727a1`
- Fixed-domain deployment: `dpl_6FaY5dYo4fBUzUmeR2ESBLy7d7Zz`
- Separate preview deployment: `dpl_3yFsVenB2EuXHAMGMdp5TetPsiXZ`

## Build

Vite; repository root; install `npm ci`; build `npm run build`; output `dist`. The existing preparation script copies WebIFC WASM and restores the bundled residential IFC from its checksum-verified compressed source. All distributed samples and notices remain bundled. No backend or new application dependency is required.

The source snapshot was downloaded from the pinned private GitHub commit and deployed using the official Vercel CLI authenticated to zykll18. The initial deployment generated the project's fixed production aliases even though preview was requested; a second distinct deployment was then created in the preview environment. This did not modify GitHub, change its private visibility, connect automatic Git deployments, or use a temporary third-party deploy service.

The textured Fern 02 / Shrub 03 update is separate from this deployed snapshot. Future local changes do not automatically update the website. Deploy deliberately from the intended reviewed version. No credentials or environment files are part of this document or the deployment upload.

## Verification

The pinned version passes 24 tests and the production build. An unauthenticated in-app browser opens the fixed-domain site without a Vercel login, loads the KIT office with 784 components, and finds the five initial recommended regions. A browser test confirms the five sample roof/facade regions, switches between Light-touch and Landscape mix, restores the original building with Before and restores vegetation with After, and verifies the relative zoom readout. The five-region tables display rounded coverage 153 m² / 165 m² and installation HK$158,728 / HK$432,606, consistently with the local inputs. The browser logged no errors or warnings during this pass.

Browser test acknowledgements are synthetic presentation inputs, not engineering approval. AI model responses are still not connected; calculations use the disclosed demonstration factors. The downloaded Shrub 03 trial remains separate.
