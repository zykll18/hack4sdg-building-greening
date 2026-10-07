/**
 * Workstream A implements this port with That Open Components.
 * `openIfc` must return the actual model version and selectable roof IDs from IFC.
 * The demo deliberately does not pretend that an uploaded file was parsed.
 *
 * @typedef {{ openIfc(file: File): Promise<{ modelVersion: string, roofs: Array<{ elementId: string, areaM2?: number }> }>,
 *   highlightRoof(elementId: string): void, showOverlay(scenarioId: string | null): void }} BimViewerPort
 */

export const bimViewerStatus = 'not-integrated';
