/*
 * Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Issue 1 (UX polish, 2026-09-26): pure helpers for the bottom (Test) panel's height in
 * `PolicyEditorWorkspace.tsx`. Split out from that component (which pulls in Monaco and other
 * heavy editor/diagram dependencies) so this logic can be unit tested cheaply.
 */

/** sessionStorage key for the user's last manual resize of the bottom (Test) panel. */
export const BOTTOM_HEIGHT_STORAGE_KEY = 'apim.policyEditorWorkspace.bottomPanelHeight';

/** sessionStorage key for the user's last collapsed/expanded choice of the bottom (Test) panel. */
export const BOTTOM_COLLAPSED_STORAGE_KEY = 'apim.policyEditorWorkspace.bottomPanelCollapsed';

/**
 * The bottom Test panel used to default to a fixed 340px, which left barely any room for the
 * side-by-side Inputs/Results layout (see `test/TestPanel.tsx`). It now defaults to 45% of the
 * dialog (= viewport, since the dialog is `fullScreen`) height, falling back to the old 340px
 * default when `window` isn't available (e.g. server-side/tests).
 * @returns {number} The default bottom panel height in px
 */
export function getDefaultBottomHeight(): number {
    try {
        return Math.round(window.innerHeight * 0.45);
    } catch (e) {
        return 340;
    }
}

/**
 * Caps how tall the bottom panel can be dragged to: 85% of the viewport height (so the diagram/
 * editor above never fully disappears), with a 300px floor for very short viewports, falling back
 * to the old fixed 640px cap when `window` isn't available.
 * @returns {number} The max bottom panel height in px
 */
export function getMaxBottomHeight(): number {
    try {
        return Math.max(300, Math.round(window.innerHeight * 0.85));
    } catch (e) {
        return 640;
    }
}

/**
 * Reads the user's last manual resize of the bottom panel from `sessionStorage` (best effort -
 * private mode/quota errors are swallowed, same pattern as `test/TestPanel.tsx`'s persistence).
 * A missing, non-numeric or non-positive value (which would otherwise permanently collapse the
 * panel) is treated as "nothing persisted".
 * @returns {number | null} The persisted height in px, or null if none/invalid
 */
export function loadPersistedBottomHeight(): number | null {
    try {
        const raw = window.sessionStorage.getItem(BOTTOM_HEIGHT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch (e) {
        return null;
    }
}

/**
 * Persists the user's manual resize of the bottom panel to `sessionStorage` (best effort).
 * @param {number} height The height in px to persist
 * @returns {void}
 */
export function savePersistedBottomHeight(height: number): void {
    try {
        window.sessionStorage.setItem(BOTTOM_HEIGHT_STORAGE_KEY, String(height));
    } catch (e) {
        // sessionStorage may be unavailable (private mode / quota) - persistence is best effort.
    }
}

/**
 * Issue 3 (UX polish, 2026-09-26): the bottom Test panel now starts COLLAPSED (a slim bar with
 * just the Run button + last status chip) so the diagram gets the full canvas until the user
 * either expands it manually or runs a test. This reads the user's last explicit choice from
 * `sessionStorage` (best effort), defaulting to collapsed (`true`) when nothing was persisted yet.
 * @returns {boolean} Whether the bottom panel should start collapsed
 */
export function loadPersistedBottomCollapsed(): boolean {
    try {
        const raw = window.sessionStorage.getItem(BOTTOM_COLLAPSED_STORAGE_KEY);
        if (raw === null) return true;
        return raw === 'true';
    } catch (e) {
        return true;
    }
}

/**
 * The height the bottom panel expands to when a test Run is triggered while it was collapsed
 * (~40% of the viewport, per the UX polish spec), independent of whatever height a previous manual
 * resize persisted.
 * @returns {number} The run-triggered expand height in px
 */
export function getRunExpandBottomHeight(): number {
    try {
        return Math.round(window.innerHeight * 0.4);
    } catch (e) {
        return 320;
    }
}

/**
 * Persists the user's collapsed/expanded choice for the bottom panel to `sessionStorage`.
 * @param {boolean} collapsed Whether the panel is currently collapsed
 * @returns {void}
 */
export function savePersistedBottomCollapsed(collapsed: boolean): void {
    try {
        window.sessionStorage.setItem(BOTTOM_COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch (e) {
        // sessionStorage may be unavailable (private mode / quota) - persistence is best effort.
    }
}
