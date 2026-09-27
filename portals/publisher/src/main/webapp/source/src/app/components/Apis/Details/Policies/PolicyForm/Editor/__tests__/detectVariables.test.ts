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

import { detectVariables } from '../parsing/detectVariables';

describe('detectVariables', () => {
    it('detects simple {{ var }} expressions', () => {
        expect(detectVariables('{{username}}&{{password}}')).toEqual(['password', 'username']);
    });

    it('detects the base identifier of a filtered expression', () => {
        expect(detectVariables('{{ price | currency }}')).toEqual(['price']);
    });

    it('detects identifiers used in an {% if %} condition', () => {
        expect(detectVariables("{% if enableRetry %}<retry/>{% endif %}")).toEqual(['enableRetry']);
    });

    it('excludes the loop variable but includes the iterated collection in {% for %}', () => {
        expect(detectVariables('{% for header in extraHeaders %}{{ header }}{% endfor %}'))
            .toEqual(['extraHeaders']);
    });

    it('de-duplicates and sorts results', () => {
        expect(detectVariables('{{b}}{{a}}{{b}}')).toEqual(['a', 'b']);
    });

    it('drops property access, keeping only the base identifier', () => {
        expect(detectVariables('{{ user.name }}')).toEqual(['user']);
    });

    it('returns an empty array when there are no jinja constructs', () => {
        expect(detectVariables('<sequence><property name="a" value="b"/></sequence>')).toEqual([]);
    });

    it('matches the sample lean-auth-policy variables', () => {
        const source = 'username={{username}}&password={{password}}&grant_type=password'
            + ' {{token_url}}';
        expect(detectVariables(source)).toEqual(['password', 'token_url', 'username']);
    });
});
