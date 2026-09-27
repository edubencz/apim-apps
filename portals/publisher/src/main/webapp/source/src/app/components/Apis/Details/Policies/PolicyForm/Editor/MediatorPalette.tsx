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

import React, { FC, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useTheme, alpha } from '@mui/material/styles';
import { FormattedMessage, useIntl } from 'react-intl';
import { MEDIATOR_SNIPPETS, MediatorSnippet } from './snippets/mediatorSnippets';
import { getMediatorCatalogEntry, getMediatorAccentColor, CATEGORY_STYLES, MediatorCategory } from './diagram/mediatorCatalog';
import { getMediatorIcon } from './diagram/iconRegistry';

interface MediatorPaletteProps {
    onInsert: (snippet: MediatorSnippet) => void;
}

/** Best-effort mapping from a snippet id (see `snippets/mediatorSnippets.tsx`) back to the tag it
 * inserts, so the palette can reuse the same category/icon/accent color as the flow diagram. */
function tagForSnippet(snippet: MediatorSnippet): string {
    if (snippet.id.startsWith('property')) return 'property';
    if (snippet.id.startsWith('header')) return 'header';
    if (snippet.id.startsWith('payloadfactory')) return 'payloadfactory';
    if (snippet.id.startsWith('log')) return 'log';
    if (snippet.id.startsWith('filter')) return 'filter';
    if (snippet.id.startsWith('switch')) return 'switch';
    if (snippet.id.startsWith('call')) return 'call';
    if (snippet.id === 'respond') return 'respond';
    if (snippet.id === 'drop') return 'drop';
    if (snippet.id === 'enrich') return 'enrich';
    if (snippet.id.startsWith('script')) return 'script';
    return 'sequence';
}

const CATEGORY_ORDER: MediatorCategory[] = ['properties', 'transformation', 'flowControl', 'calls', 'logging', 'termination', 'neutral'];

/**
 * Docked, searchable list of mediator snippets that can be inserted at the current cursor
 * position in `PolicyCodeEditor`, grouped by the same categories used in the flow diagram (each
 * item shares its icon/accent color with the corresponding diagram node). Purely presentational -
 * insertion is delegated to the parent (`PolicyEditorWorkspace`) via `onInsert`.
 * @param {MediatorPaletteProps} props Component props
 * @returns {TSX} The rendered palette
 */
const MediatorPalette: FC<MediatorPaletteProps> = ({ onInsert }) => {
    const theme = useTheme();
    const intl = useIntl();
    const mode = theme.palette.mode === 'dark' ? 'dark' : 'light';
    const [query, setQuery] = useState('');

    const grouped = useMemo(() => {
        const q = query.trim().toLowerCase();
        const byCategory = new Map<MediatorCategory, MediatorSnippet[]>();
        MEDIATOR_SNIPPETS.forEach((snippet) => {
            if (q && !snippet.label.toLowerCase().includes(q) && !snippet.description.toLowerCase().includes(q)) {
                return;
            }
            const tag = tagForSnippet(snippet);
            const { category } = getMediatorCatalogEntry(tag);
            if (!byCategory.has(category)) byCategory.set(category, []);
            byCategory.get(category)!.push(snippet);
        });
        return CATEGORY_ORDER
            .filter((cat) => byCategory.has(cat))
            .map((cat) => ({ category: cat, items: byCategory.get(cat)! }));
    }, [query]);

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }} data-testid='mediator-palette'>
            <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                <Typography variant='subtitle2' sx={{ mb: 1 }}>
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.Editor.MediatorPalette.title'
                        defaultMessage='Mediators'
                    />
                </Typography>
                <TextField
                    fullWidth
                    size='small'
                    placeholder={intl.formatMessage({
                        id: 'Apis.Details.Policies.PolicyForm.Editor.MediatorPalette.search',
                        defaultMessage: 'Search mediators…',
                    })}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    data-testid='mediator-palette-search'
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position='start'>
                                <SearchOutlinedIcon fontSize='small' />
                            </InputAdornment>
                        ),
                    }}
                />
            </Box>
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {grouped.length === 0 && (
                    <Typography variant='body2' color='text.secondary' sx={{ px: 2, py: 1 }}>
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.MediatorPalette.noResults'
                            defaultMessage='No mediators match "{query}"'
                            values={{ query }}
                        />
                    </Typography>
                )}
                {grouped.map(({ category, items }) => (
                    <Box key={category} sx={{ mb: 0.5 }}>
                        <Typography
                            variant='overline'
                            sx={{
                                display: 'block', px: 2, pt: 1.5, pb: 0.25, color: 'text.secondary', letterSpacing: 0.6,
                            }}
                        >
                            {CATEGORY_STYLES[category].label}
                        </Typography>
                        <List dense disablePadding>
                            {items.map((snippet) => {
                                const tag = tagForSnippet(snippet);
                                const { icon } = getMediatorCatalogEntry(tag);
                                const accent = getMediatorAccentColor(tag, mode);
                                const Icon = getMediatorIcon(icon);
                                return (
                                    <ListItemButton
                                        key={snippet.id}
                                        onClick={() => onInsert(snippet)}
                                        data-testid={`mediator-palette-item-${snippet.id}`}
                                        sx={{ gap: 1.25, alignItems: 'flex-start', py: 0.75 }}
                                    >
                                        <Box
                                            sx={{
                                                width: 28,
                                                height: 28,
                                                borderRadius: '50%',
                                                bgcolor: alpha(accent, mode === 'dark' ? 0.22 : 0.12),
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                mt: 0.25,
                                            }}
                                        >
                                            <Icon sx={{ width: 16, height: 16 }} htmlColor={accent} />
                                        </Box>
                                        <ListItemText primary={snippet.label} secondary={snippet.description} />
                                    </ListItemButton>
                                );
                            })}
                        </List>
                    </Box>
                ))}
            </Box>
        </Box>
    );
};

export default MediatorPalette;
