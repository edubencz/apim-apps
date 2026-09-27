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

import React, {
    forwardRef, useEffect, useImperativeHandle, useRef,
} from 'react';
import * as monaco from 'monaco-editor';
import { Editor, loader, Monaco } from '@monaco-editor/react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { MEDIATOR_SNIPPETS } from './snippets/mediatorSnippets';
import type { ParseError } from './types';

loader.config({ monaco });

export interface PolicyCodeEditorHandle {
    revealLine: (line: number) => void;
    insertSnippet: (text: string) => void;
}

export interface RemoteMarker {
    line: number;
    column: number;
    message: string;
    severity?: 'error' | 'warning';
}

interface PolicyCodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    localErrors?: ParseError[];
    remoteMarkers?: RemoteMarker[];
    /** Names of the policy's own attributes, offered as `{{name}}` completions */
    attributeNames?: string[];
    onCursorLineChange?: (line: number) => void;
    readOnly?: boolean;
    height?: string | number;
}

const LANGUAGE_ID = 'xml';
let providersRegistered = false;
let disposeProviders: (() => void) | null = null;

/**
 * Registers the mediator-tag/attribute completion provider once per page load (Monaco's language
 * providers are global, so registering per-editor-instance would create duplicates every time a
 * new `PolicyCodeEditor` mounts - e.g. compact preview + full workspace open at once).
 * @param {Monaco} monacoInstance The monaco namespace handed to `onMount`/`beforeMount`
 * @param {() => string[]} getAttributeNames Lazily reads the *current* attribute names, so the
 * single global provider always offers the latest set without needing to re-register
 */
function ensureProviders(monacoInstance: Monaco, getAttributeNames: () => string[]) {
    if (providersRegistered) {
        return;
    }
    providersRegistered = true;

    const completionDisposable = monacoInstance.languages.registerCompletionItemProvider(LANGUAGE_ID, {
        triggerCharacters: ['<', '{'],
        provideCompletionItems: (model, position) => {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };
            const mediatorSuggestions = MEDIATOR_SNIPPETS.map((snippet) => ({
                label: snippet.label,
                kind: monacoInstance.languages.CompletionItemKind.Snippet,
                documentation: snippet.description,
                insertText: snippet.body,
                insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range,
            }));
            const attributeSuggestions = getAttributeNames().map((name) => ({
                label: `{{${name}}}`,
                kind: monacoInstance.languages.CompletionItemKind.Variable,
                documentation: `Policy attribute "${name}"`,
                insertText: `{{${name}}}`,
                range,
            }));
            return { suggestions: [...mediatorSuggestions, ...attributeSuggestions] };
        },
    });

    disposeProviders = () => {
        completionDisposable.dispose();
        providersRegistered = false;
        disposeProviders = null;
    };
}

const JINJA_DECORATION_CLASS = 'apim-editor-jinja-token';

/**
 * Monaco-based `.j2` XML editor used by the policy editor workspace (and, in compact form, by
 * `SourceDetails.tsx`). Highlights `{{ }}`/`{% %}` jinja constructs, offers mediator snippet and
 * `{{attributeName}}` completions, surfaces local parse errors plus optional server-rendered
 * errors as markers, and exposes `revealLine`/`insertSnippet` imperatively so the flow diagram
 * and the mediator palette can drive the editor.
 */
const PolicyCodeEditor = forwardRef<PolicyCodeEditorHandle, PolicyCodeEditorProps>(({
    value, onChange, localErrors, remoteMarkers, attributeNames, onCursorLineChange, readOnly, height,
}, ref) => {
    const theme = useTheme();
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const decorationsRef = useRef<string[]>([]);
    const attributeNamesRef = useRef<string[]>(attributeNames || []);
    attributeNamesRef.current = attributeNames || [];

    useImperativeHandle(ref, () => ({
        revealLine: (line: number) => {
            const editor = editorRef.current;
            if (!editor) return;
            editor.revealLineInCenter(line);
            editor.setPosition({ lineNumber: line, column: 1 });
            editor.focus();
        },
        insertSnippet: (text: string) => {
            const editor = editorRef.current;
            const monacoInstance = monacoRef.current;
            if (!editor || !monacoInstance) return;
            const contribution = editor.getContribution('snippetController2') as any;
            editor.focus();
            if (contribution && typeof contribution.insert === 'function') {
                contribution.insert(text);
            } else {
                const position = editor.getPosition();
                if (position) {
                    editor.executeEdits('insert-snippet', [{
                        range: new monacoInstance.Range(
                            position.lineNumber, position.column, position.lineNumber, position.column,
                        ),
                        text,
                    }]);
                }
            }
        },
    }), []);

    const applyJinjaDecorations = (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
        const model = editor.getModel();
        if (!model) return;
        const text = model.getValue();
        const ranges: monaco.editor.IModelDeltaDecoration[] = [];
        const patterns = [/\{\{[\s\S]*?\}\}/g, /\{%[\s\S]*?%\}/g, /\{#[\s\S]*?#\}/g];
        patterns.forEach((pattern) => {
            let match: RegExpExecArray | null;
            // eslint-disable-next-line no-cond-assign
            while ((match = pattern.exec(text)) !== null) {
                const startPos = model.getPositionAt(match.index);
                const endPos = model.getPositionAt(match.index + match[0].length);
                ranges.push({
                    range: new monacoInstance.Range(
                        startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column,
                    ),
                    options: { inlineClassName: JINJA_DECORATION_CLASS },
                });
            }
        });
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, ranges);
    };

    const applyMarkers = () => {
        const editor = editorRef.current;
        const monacoInstance = monacoRef.current;
        const model = editor?.getModel();
        if (!editor || !monacoInstance || !model) return;
        const markers: monaco.editor.IMarkerData[] = [];
        (localErrors || []).forEach((err) => {
            markers.push({
                severity: monacoInstance.MarkerSeverity.Error,
                message: err.message,
                startLineNumber: Math.max(1, err.line),
                startColumn: Math.max(1, err.column),
                endLineNumber: Math.max(1, err.line),
                endColumn: Math.max(1, err.column) + 1,
            });
        });
        (remoteMarkers || []).forEach((err) => {
            markers.push({
                severity: err.severity === 'warning'
                    ? monacoInstance.MarkerSeverity.Warning
                    : monacoInstance.MarkerSeverity.Error,
                message: err.message,
                startLineNumber: Math.max(1, err.line),
                startColumn: Math.max(1, err.column),
                endLineNumber: Math.max(1, err.line),
                endColumn: Math.max(1, err.column) + 1,
            });
        });
        monacoInstance.editor.setModelMarkers(model, 'apim-policy-editor', markers);
    };

    useEffect(() => {
        applyMarkers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localErrors, remoteMarkers]);

    useEffect(() => {
        if (editorRef.current && monacoRef.current) {
            applyJinjaDecorations(editorRef.current, monacoRef.current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    useEffect(() => () => {
        // Only the last unmounting editor instance actually owns the (single, global) provider.
        if (disposeProviders) {
            disposeProviders();
        }
    }, []);

    return (
        <Box sx={{
            height: height || '100%',
            '& .monaco-editor': { borderRadius: theme.shape.borderRadius },
            [`& .${JINJA_DECORATION_CLASS}`]: {
                color: theme.palette.mode === 'dark' ? '#ce9178' : '#a31515',
                fontWeight: 600,
            },
        }}
        >
            <Editor
                height='100%'
                defaultLanguage={LANGUAGE_ID}
                value={value}
                theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
                onChange={(newValue) => onChange(newValue || '')}
                onMount={(editor, monacoInstance) => {
                    editorRef.current = editor;
                    monacoRef.current = monacoInstance;
                    ensureProviders(monacoInstance, () => attributeNamesRef.current);
                    applyJinjaDecorations(editor, monacoInstance);
                    applyMarkers();
                    editor.onDidChangeCursorPosition((e) => {
                        if (onCursorLineChange) {
                            onCursorLineChange(e.position.lineNumber);
                        }
                    });
                }}
                options={{
                    readOnly: Boolean(readOnly),
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    tabSize: 4,
                    automaticLayout: true,
                }}
            />
        </Box>
    );
});

PolicyCodeEditor.displayName = 'PolicyCodeEditor';

export default PolicyCodeEditor;
