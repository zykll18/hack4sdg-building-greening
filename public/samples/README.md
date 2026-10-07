# Building review samples

`Building-Architecture.ifc` is an unchanged copy of buildingSMART's IFC4 Simple-Scene building architecture dataset.

- Author and copyright: buildingSMART International Ltd.
- Source revision: `80d976a9b193a26a8e928c3e79bff67af1de68a8`
- [Original IFC](https://github.com/buildingSMART/Sample-Test-Files/blob/80d976a9b193a26a8e928c3e79bff67af1de68a8/IFC%204.0.2.1%20%28IFC%204%20ADD2%20TC1%29/Simple-Scene/Building-Architecture.ifc)
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/), also recorded in `LICENSE.txt`.
- No modifications were made to the IFC file. The app's rendering/import settings are separate from the source dataset.

This educational test house includes an aggregate roof and roof-slab components. It is not a Hong Kong project or an engineering-ready retrofit design.

## That Open school samples

- Source and attribution: That Open Company, `ThatOpen/engine_components` repository.
- Pinned revision: `8479a7c5c6a3c0cf8c7ceab1d1fb329a3f7d1922`.
- [School architecture Fragments](https://github.com/ThatOpen/engine_components/blob/8479a7c5c6a3c0cf8c7ceab1d1fb329a3f7d1922/resources/frags/school_arq.frag): 3,391,365 bytes. Git blob `ef2f8aa93924664c4b33ee6bc1a2670a1abb7151`.
- [School structural IFC](https://github.com/ThatOpen/engine_components/blob/8479a7c5c6a3c0cf8c7ceab1d1fb329a3f7d1922/resources/ifc/school_str.ifc): 8,593,426 bytes. Git blob `a5291c37ca7cd21743e4b75864d057573e1bc6a5`.
- License: the upstream MIT notice is preserved verbatim in `LICENSE-ThatOpen.md`.
- Both files are unchanged; viewer settings do not alter the source model.

The school architecture sample is preconverted Fragments, used by the official That Open Highlighter and rendering tutorials. It retains IFC-derived categories, properties and GlobalIds. It is a visual/data reference, not an IFC parsing test. Use the structural school IFC to test upload and conversion. These two school files are different discipline models and should not be treated as an identical-model before/after comparison. Neither sample represents a Hong Kong project, verified roof area, or retrofit engineering approval.

## Additional architectural models

### KIT Office and FZK House

Author/attribution: Institute for Automation and Applied Informatics (IAI) / Karlsruhe Institute of Technology (KIT). The [KIT IFC Examples publication](https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples) provides the models for unrestricted use and requests attribution in publications. Its stated permission is recorded in `NOTICE-KIT.txt`; no named license is invented.

- `KIT-Office.ifc`: unchanged [AC20-Institute-Var-2.ifc](https://www.ifcwiki.org/images/9/98/AC20-Institute-Var-2.ifc), 10,934,237 bytes. Multi-storey office design example, with envelope, window and roof geometry. The publication describes it as a fictional office building.
- `KIT-FZK-Haus.ifc`: unchanged [AC20-FZK-Haus.ifc](https://www.ifcwiki.org/images/e/e3/AC20-FZK-Haus.ifc), 2,570,803 bytes. Compact architectural house design example. The publication describes it as fictional.

Retrieved 2026-10-07. Both original files retain their IFC headers. Local names are simplified aliases; contents are unchanged. Checksums are in `architectural-model-checks.json`.

### Schependomlaan residential project

- Design author: ROOT bv, commissioned by Hendriks Bouw en Ontwikkeling, as documented by the dataset publisher.
- Dataset collected by Stijn van Schaijk during his TU Eindhoven master's research, in collaboration with the project partners named in the source README.
- [Source project and dataset description](https://github.com/buildingsmart-community/Community-Sample-Test-Files/tree/7ddf57a201f88a0c213d5322b02ed15e94a60a40/IFC%202.3.0.1%20%28IFC%202x3%29/Schependomlaan).
- Original file: `Design model IFC/IFC Schependomlaan.ifc`, not the differently structured Synchro as-planned exports.
- Community repository revision: `7ddf57a201f88a0c213d5322b02ed15e94a60a40`.
- License: community repository CC BY 4.0 notice, preserved in `LICENSE-Community.txt`. The project README also explicitly records permission for scientific and academic use.
- Unchanged download: 49,286,967 bytes; SHA-256 `2c3565ca1904f2aa61adab92024cf3755b2c5b21a498144d3094d7cb58cebec7`, verified against the source Git LFS pointer.

The publisher documents a real project with construction schedules and as-built point clouds, which supports its project provenance. This does not establish that the IFC is a certified final as-built model. The source warns of some dataset errors. Our checks establish parser/identity compatibility only; geometry and engineering quantities still need review.

### Geometry previews

The PNG previews are generated locally from each downloaded IFC's placed geometry using WebIFC and a static depth-buffer render with simplified lighting/glass treatment. They show the actual model shape and support choosing a sample. They are not photographs, the publisher's architectural visualizations, or screenshots of the web application. The source files are not modified. `IFC-model-previews.png` combines the three previews.

The residential IFC is committed as lossless `Schependomlaan.ifc.gz` for repository size/upload compatibility. `npm run dev` and `npm run build` restore `Schependomlaan.ifc` through the existing asset-preparation script and verify the upstream SHA-256. The compressed/uncompressed round trip was checked byte-for-byte. The browser receives the original IFC, and the sample download stays a normal IFC.
