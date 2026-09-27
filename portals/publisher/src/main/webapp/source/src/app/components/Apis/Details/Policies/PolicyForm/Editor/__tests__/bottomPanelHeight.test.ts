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

import {
    BOTTOM_HEIGHT_STORAGE_KEY,
    getDefaultBottomHeight,
    getMaxBottomHeight,
    loadPersistedBottomHeight,
    savePersistedBottomHeight,
} from '../utils/bottomPanelHeight';

/**
 * Issue 1 (UX polish): the bottom Test panel now defaults to 45% of the dialog/viewport height
 * (was a fixed 340px) and remembers the user's manual resize in `sessionStorage` (best effort).
 * These are the pure helpers backing that behaviour - see `PolicyEditorWorkspace.tsx`.
 */
describe('PolicyEditorWorkspace bottom panel height (Issue 1)', () => {
    const originalInnerHeight = window.innerHeight;

    beforeEach(() => {
        window.sessionStorage.clear();
    });

    afterEach(() => {
        Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
    });

    it('defaults to 45% of the current viewport height', () => {
        Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
        expect(getDefaultBottomHeight()).toBe(450);

        Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
        expect(getDefaultBottomHeight()).toBe(405);
    });

    it('caps the max resize height at 85% of the viewport, with a floor of 300', () => {
        Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
        expect(getMaxBottomHeight()).toBe(850);

        Object.defineProperty(window, 'innerHeight', { value: 200, configurable: true });
        expect(getMaxBottomHeight()).toBe(300);
    });

    it('returns null when nothing was persisted yet', () => {
        expect(loadPersistedBottomHeight()).toBeNull();
    });

    it('round-trips a persisted resize through sessionStorage', () => {
        savePersistedBottomHeight(512);
        expect(window.sessionStorage.getItem(BOTTOM_HEIGHT_STORAGE_KEY)).toBe('512');
        expect(loadPersistedBottomHeight()).toBe(512);
    });

    it('ignores corrupt/non-numeric persisted values instead of throwing', () => {
        window.sessionStorage.setItem(BOTTOM_HEIGHT_STORAGE_KEY, 'not-a-number');
        expect(loadPersistedBottomHeight()).toBeNull();
    });

    it('ignores a persisted zero/negative height (would collapse the panel permanently)', () => {
        window.sessionStorage.setItem(BOTTOM_HEIGHT_STORAGE_KEY, '0');
        expect(loadPersistedBottomHeight()).toBeNull();
        window.sessionStorage.setItem(BOTTOM_HEIGHT_STORAGE_KEY, '-50');
        expect(loadPersistedBottomHeight()).toBeNull();
    });
});
