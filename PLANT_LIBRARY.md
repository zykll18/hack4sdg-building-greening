# Reviewed plant catalog and recommendation boundary

`src/data/plants.json` stores seven reviewed Hong Kong plant profiles. The catalog is shipped with the app; it needs no database, credentials or new dependencies. The source is the Hong Kong Development Bureau Greening, Landscape and Tree Management Section's *Pictorial Guide to Plant Resources for Skyrise Greenery*. Each profile retains the exact scientific identity used in that guide, a direct species PDF link, page number, review date and method. The guide's legend and each species page were visually checked on 10 October 2026. Botanical guide photographs remain at source. Seven separately licensed Wikimedia reference photographs are bundled, with attribution, license links and file hashes in `public/plants/library/README.md` and `manifest.json`. The library detail view displays those credits.

| ID | Chinese name | Guide reference soil depth | Irrigation demand | Recorded ornamental months |
| --- | --- | --- | --- | --- |
| sedum-lineare | 佛甲草 | 100–200 mm | Low | Flower: April–May |
| arachis-pintoi | 多年生花生 | 100–200 mm | Moderate | Flower: June |
| ophiopogon-japonicus | 麦冬（沿阶草） | 200–300 mm | Moderate | Not recorded |
| ficus-pumila | 薜荔 | 200–300 mm | Moderate | Not recorded |
| trachelospermum-jasminoides | 络石 | 450–600 mm | Moderate | Flower: March–June |
| parthenocissus-dalzielii | 爬墙虎（异叶爬山虎） | 300–450 mm | High | Leaf: September–November |
| bougainvillea-spectabilis | 叶子花（簕杜鹃） | 450–600 mm | Moderate | Floral display: January–December |

These are the guide's reference categories and recorded ornamental months. They are not universal minimum depths, sowing/planting dates, a guarantee of year-round flowering, or load approval. Null fields mean the reviewed source does not establish the value. Grey icons in the guide are not translated into claims of intolerance. Light requirements, planting windows, species-specific carbon factors and verified species-specific 3D assets remain unknown. Roof / facade application mappings follow the guide examples; terrace / ground mappings are explicit project planning interpretations requiring site review.

## User flow

Inspect → ask about plants by text or reviewed voice transcript → Plant library opens → enter known location, soil depth, light, irrigation capacity and optional display month → view up to three conditional suggestions with source links and missing checks. A facade additionally asks whether reviewed rooting space / support is available. Unknown fields stay unknown; IFC does not establish plant growing conditions. Explicit question values such as `roof plants, 150 mm, low water, April` update the visible controls. Multiple location types ask the user to choose one rather than silently apply a single site condition to all surfaces.

Changing conditions invalidates the old shortlist. Replacing a model clears the shortlist, growing conditions and old question, and collapses the library. Plant queries do not change selected model locations, previews or calculation inputs. Location questions still use the existing IFC-screening workflow. The library is collapsed by default so Inspect stays compact. Download plant shortlist exports all eligible candidates with their conditions, provenance and current model version; it does not apply a species to a physical region. The normal region/scenario handoff includes the current shortlist as an optional `plantRecommendation` field.

## Screening and future AI

`src/domain/plant-recommendations.js` first screens application mappings, entered soil depth against the lower guide reference and available irrigation against the guide's ordinal demand. These are deliberately coarse horticultural screens. Unknown light remains a check; recorded shade tolerance improves ranking in shade without converting missing tolerance data into a rejection. No facade system excludes facade candidates, including self-clinging plants. Matching ornamental months add a secondary ranking preference without excluding plants outside those months. Every remaining candidate stays conditional and retains engineering / maintenance checks.

No live AI service is connected. `buildPlantRecommendationContext` constructs the bounded candidate/fact/source payload for a future server-side AI call. `validatePlantModelReply` permits only one to three unique candidate IDs from that payload, rejects invented/excluded identities, and obtains names, sources and checks from the catalog rather than model text. Model explanations remain draft prose; ID validation does not prove every explanatory sentence is correct. A future service must authenticate/validate requests, rerun screening from the server-owned catalog and render model text as plain text, with no browser API keys.

## Team ownership and updates

Task C maintains plant facts, exact species identity, source provenance and horticultural review; Task D wires the future AI service to the bounded shortlist; Task A owns Inspect cards, conditions and exports. Task B's cost/carbon calculations remain independent. New species need a source page/legend review, stable ID, nullable undocumented fields, explicit application-mapping basis, date and relevant screening tests. Update the catalog version on fact changes. A botanical record may reference a 3D asset only after the species identity and asset license have been checked; the imported fern/shrub assets remain generic concepts. The seven authored GLBs are separately tagged as concept appearances in `visualModel`, without claiming verified botanical asset identity.

## Verification

Unit tests cover provenance and unknown fields, shallow/low-water screening, seasonal reordering without exclusion, facade-system availability, bilingual input validation and AI unknown/excluded/duplicate ID rejection. Browser acceptance should check typed questions, changed inputs, no-match reasons, unchanged model selection, downloaded JSON, and resets after loading another model. Voice recognition still depends on browser support and microphone permission; catalog tests do not prove recognition accuracy.


## Standalone browsing (11 October 2026)

The **Plants** workspace control opens an independent nonmodal catalog over the IFC background. Search Chinese, English or scientific names; combine application-location and native-species filters. Select a photo card to view identity, reference picture, description, application locations, soil depth, light information, ornamental-month calendar, water/pruning demand, support system, native/foliage identity, environmental tolerances and sources. Mobile uses a scrollable list followed by details. Empty searches offer Clear filters; failed pictures show an unavailable state.

`web/plant-library.js` owns presentation; `src/domain/plant-library.js` owns browsing filters and seasonal labels. Inspect retains site conditions and bounded recommendations, with View plant details opening the standalone profile. Browsing does not modify the building. The explicit Use at selected location action assigns the species concept model; Inspect controls density and coverage. Exact daily water volume, water quality, irrigation method, rainwater compatibility, mature height/spread and safety notes remain nullable. Site water-point/supply/drainage checks are clearly distinguished from source-backed botanical requirements. Fertilising, toxicity, pest information and planting season need additional review; do not infer them from photographs or replace unknowns with invented values. Image colour is a reference, not a guarantee of cultivar identity.

Catalog facts still reviewed 10 October; photos and browsing added 11 October. No dependency, framework or backend added. The asset subfolder separates licensed reference photographs from existing 3D files. Tests check combined bilingual search, file/provenance integrity and unknown-field semantics in addition to the recommendation tests.


## Applying concept models

Open Plants, choose a species, expand **3D plant model** to rotate its clump/vine specimen, and download the GLB if needed. Select locations in the IFC, then **Use at selected location** in the library (or a recommendation card). Inspect supports a separate species, density and coverage for each pending/confirmed location. Roof/terrace/ground options follow catalog mappings; facade options are climbers. No selected location or an incompatible species gives an explicit message. Confirm pending areas before showing planting. Adjustments to confirmed planting rebuild the same After view; Before preserves the original building. Fields appear in comparison handoff JSON.

The models are authored concept geometry, independent of the licensed plant photos. They are not photogrammetry, certified specimens, mature growth forecasts or species-specific environmental calculations. Flowers/bracts indicate visual identity; appearance does not predict flowering for a given day. Water, light, loading, wall fixings and maintenance still need site review. Both plans keep generic demo rates. Density is decorative; explicit coverage is analytical. Model exports and catalog hashes must be regenerated together. Seven source-model/GLB integrity, supported placement, openings, density and area-consistency tests extend the catalog and recommendation checks.
