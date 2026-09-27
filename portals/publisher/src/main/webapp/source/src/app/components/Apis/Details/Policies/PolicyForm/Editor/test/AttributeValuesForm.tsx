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

import React, { FC } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import { FormattedMessage, useIntl } from 'react-intl';
import type { PolicyAttribute } from '../../Types';

interface AttributeValuesFormProps {
    policyAttributes: PolicyAttribute[];
    /** `{{var}}`/`{% %}` references found in the editor content that are not a declared attribute */
    extraVariables: string[];
    attributeValues: Record<string, any>;
    onChange: (name: string, value: any) => void;
}

/**
 * Validates a candidate value against a policy attribute's declared `validationRegex`, when set.
 * @param {PolicyAttribute} attribute The policy attribute
 * @param {any} value Candidate value (already stringified by the caller for non-boolean types)
 * @returns {string} Empty string when valid, otherwise a user-facing error message
 */
function validate(attribute: PolicyAttribute, value: any): string {
    if (!attribute.validationRegex || value === undefined || value === null || value === '') {
        return '';
    }
    try {
        if (!new RegExp(attribute.validationRegex).test(String(value))) {
            return `Does not match ${attribute.validationRegex}`;
        }
    } catch (e) {
        // Invalid regex on the spec itself - nothing to validate against.
    }
    return '';
}

/**
 * One input per `policyAttribute` declared on the spec (String/Integer/Boolean/Enum, honoring
 * `required`/`defaultValue`/`validationRegex`), plus a free-text input for every `{{var}}`
 * detected in the editor content that is not (yet) a declared attribute - so a policy author can
 * still test-run a draft before formalizing those as attributes.
 * @param {AttributeValuesFormProps} props Component props
 * @returns {TSX} The attribute values form
 */
const AttributeValuesForm: FC<AttributeValuesFormProps> = ({
    policyAttributes, extraVariables, attributeValues, onChange,
}) => {
    const intl = useIntl();
    const declaredNames = new Set(policyAttributes.map((a) => a.name));
    const undeclaredExtras = extraVariables.filter((name) => !declaredNames.has(name));

    return (
        <Box data-testid='test-panel-attribute-values-form'>
            <Grid container spacing={2}>
                {policyAttributes.map((attribute) => {
                    const value = attributeValues[attribute.name] ?? attribute.defaultValue ?? '';
                    const type = (attribute.type || 'String').toLowerCase();
                    if (type === 'boolean') {
                        return (
                            <Grid item xs={12} sm={6} md={4} key={attribute.name}>
                                <FormControlLabel
                                    control={(
                                        <Checkbox
                                            checked={value === true || value === 'true'}
                                            onChange={(e) => onChange(attribute.name, e.target.checked)}
                                            data-testid={`test-panel-attr-${attribute.name}`}
                                        />
                                    )}
                                    label={attribute.displayName || attribute.name}
                                />
                            </Grid>
                        );
                    }
                    if (type === 'enum' && (attribute.allowedValues || []).length > 0) {
                        return (
                            <Grid item xs={12} sm={6} md={4} key={attribute.name}>
                                <TextField
                                    select
                                    fullWidth
                                    size='small'
                                    label={attribute.displayName || attribute.name}
                                    required={attribute.required}
                                    value={value}
                                    onChange={(e) => onChange(attribute.name, e.target.value)}
                                    data-testid={`test-panel-attr-${attribute.name}`}
                                >
                                    {(attribute.allowedValues || []).map((allowed) => (
                                        <MenuItem key={allowed} value={allowed}>{allowed}</MenuItem>
                                    ))}
                                </TextField>
                            </Grid>
                        );
                    }
                    const errorText = validate(attribute, value);
                    return (
                        <Grid item xs={12} sm={6} md={4} key={attribute.name}>
                            <TextField
                                fullWidth
                                size='small'
                                type={type === 'integer' ? 'number' : 'text'}
                                label={attribute.displayName || attribute.name}
                                required={attribute.required}
                                value={value}
                                error={Boolean(errorText)}
                                helperText={errorText || attribute.description}
                                onChange={(e) => onChange(attribute.name, e.target.value)}
                                data-testid={`test-panel-attr-${attribute.name}`}
                            />
                        </Grid>
                    );
                })}
                {undeclaredExtras.map((name) => (
                    <Grid item xs={12} sm={6} md={4} key={`extra-${name}`}>
                        <TextField
                            fullWidth
                            size='small'
                            label={name}
                            value={attributeValues[name] ?? ''}
                            helperText={intl.formatMessage({
                                id: 'Apis.Details.Policies.PolicyForm.Editor.Test.AttributeValuesForm.'
                                    + 'extra.helperText',
                                defaultMessage: 'Referenced in the policy body but not declared as an attribute',
                            })}
                            onChange={(e) => onChange(name, e.target.value)}
                            data-testid={`test-panel-extra-${name}`}
                        />
                    </Grid>
                ))}
                {policyAttributes.length === 0 && undeclaredExtras.length === 0 && (
                    <Grid item xs={12}>
                        <Typography variant='body2' color='text.secondary'>
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.Test.AttributeValuesForm.empty'
                                defaultMessage='This policy does not reference any attributes/variables.'
                            />
                        </Typography>
                    </Grid>
                )}
            </Grid>
        </Box>
    );
};

export default AttributeValuesForm;
