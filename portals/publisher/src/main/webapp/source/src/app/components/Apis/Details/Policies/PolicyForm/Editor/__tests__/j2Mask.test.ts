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

import { j2Mask } from '../parsing/j2Mask';

describe('j2Mask', () => {
    it('keeps the same length and line/column layout for {{ }} expressions', () => {
        const source = 'a={{username}};b={{password | upper}};';
        const masked = j2Mask(source);
        expect(masked.length).toBe(source.length);
        expect(masked.startsWith('a=')).toBe(true);
        expect(masked).toContain(';b=');
        expect(masked.endsWith(';')).toBe(true);
        expect(masked).not.toContain('username');
        expect(masked).not.toContain('password');
        expect(/^a=x+;b=x+;$/.test(masked)).toBe(true);
    });

    it('preserves newlines inside a masked block so later line numbers are unaffected', () => {
        const source = 'line1\n{{\n  multi\n  line\n}}\nline5';
        const masked = j2Mask(source);
        expect(masked.split('\n').length).toBe(source.split('\n').length);
        expect(masked.endsWith('line5')).toBe(true);
        expect(masked.startsWith('line1\n')).toBe(true);
    });

    it('masks {% %} statement blocks but leaves content between open/close tags untouched', () => {
        const source = '<a>{% if x %}<b/>{% endif %}</a>';
        const masked = j2Mask(source);
        expect(masked.length).toBe(source.length);
        expect(masked).toContain('<b/>');
        expect(masked).not.toContain('if x');
        expect(masked).not.toContain('endif');
    });

    it('masks {# #} comment blocks', () => {
        const source = 'x{# a jinja comment #}y';
        const masked = j2Mask(source);
        expect(masked.length).toBe(source.length);
        expect(masked).not.toContain('jinja comment');
        expect(masked.startsWith('x')).toBe(true);
        expect(masked.endsWith('y')).toBe(true);
    });

    it('leaves plain XML untouched', () => {
        const source = '<sequence><property name="a" value="b"/></sequence>';
        expect(j2Mask(source)).toBe(source);
    });
});
