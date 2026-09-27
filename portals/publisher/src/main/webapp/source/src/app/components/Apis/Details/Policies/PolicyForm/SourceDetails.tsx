/*
 * Copyright (c) 2022, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
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
    FC, useContext, useMemo, useRef, useState,
} from 'react';
import { styled } from '@mui/material/styles';
import { Theme } from '@mui/material';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Checkbox from '@mui/material/Checkbox';
import FormHelperText from '@mui/material/FormHelperText';
import Typography from '@mui/material/Typography';
import { FormattedMessage, useIntl } from 'react-intl';
import FormControl from '@mui/material/FormControl';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Utils from 'AppData/Utils';
import API from 'AppData/api.js';
import { Alert } from 'AppComponents/Shared';
import { usePublisherSettings } from 'AppComponents/Shared/AppContext';
import CONSTS from 'AppData/Constants';
import { ACTIONS } from './PolicyCreateForm';
import UploadPolicyDropzone from './UploadPolicyDropzone';
import ApiContext from '../../components/ApiContext';
import { Link } from 'react-router-dom';
import type { PolicyAttribute } from './Types';
import PolicyCodeEditor from './Editor/PolicyCodeEditor';
import PolicyEditorWorkspace, { PolicyEditorWorkspaceHandle } from './Editor/PolicyEditorWorkspace';
import { parseSynapseXml } from './Editor/parsing/parseSynapseXml';
import TestPanel from './Editor/test/TestPanel';
import type { PolicyTestResponse } from './Editor/test/types';

const PREFIX = 'SourceDetails';

const classes = {
    mandatoryStar: `${PREFIX}-mandatoryStar`,
    formGroup: `${PREFIX}-formGroup`
};

const StyledBox = styled(Box)(({ theme }: { theme: Theme }) => ({
    [`& .${classes.mandatoryStar}`]: {
        color: theme.palette.error.main,
        marginLeft: theme.spacing(0.1),
    },

    [`& .${classes.formGroup}`]: {
        display: 'flex',
        flexDirection: 'row',
    }
}));

interface SourceDetailsProps {
    supportedGateways: string[];
    synapsePolicyDefinitionFile?: any[];
    setSynapsePolicyDefinitionFile?: React.Dispatch<React.SetStateAction<any[]>>;
    ccPolicyDefinitionFile?: any[];
    setCcPolicyDefinitionFile?: React.Dispatch<React.SetStateAction<any[]>>;
    dispatch?: React.Dispatch<any>;
    isViewMode?: boolean;
    policyId?: string;
    isAPISpecific?: boolean;
    /** 'upload' (dropzone) | 'editor' (Monaco + live diagram) - only used when both this and
     * setSourceMode are provided (PolicyCreateForm); other call-sites keep the plain dropzone. */
    sourceMode?: 'upload' | 'editor';
    setSourceMode?: React.Dispatch<React.SetStateAction<'upload' | 'editor'>>;
    synapseEditorContent?: string;
    setSynapseEditorContent?: React.Dispatch<React.SetStateAction<string>>;
    policyAttributes?: PolicyAttribute[];
    /** View mode only: "Duplicate into editor" handler, see ViewPolicy.tsx */
    onDuplicateIntoEditor?: () => void;
    duplicating?: boolean;
    /** Create mode only (see PolicyCreateForm.tsx): saves the policy using the same path as the
     * form's Save button, wired to the editor workspace's "Save policy" header button. */
    onSavePolicy?: () => void;
    /** True while the form is missing required fields - the editor's Save button then just
     * closes the editor (back to the form) and surfaces a snackbar instead of saving. */
    saveDisabled?: boolean;
    /** Mirrors PolicyCreateForm's `saving` state. */
    saving?: boolean;
}

/**
 * Renders the general details section.
 * @param {JSON} props Input props from parent components.
 * @returns {TSX} General details of the policy.
 */
const SourceDetails: FC<SourceDetailsProps> = ({
    supportedGateways,
    synapsePolicyDefinitionFile,
    setSynapsePolicyDefinitionFile,
    ccPolicyDefinitionFile,
    setCcPolicyDefinitionFile,
    dispatch,
    isViewMode,
    policyId,
    isAPISpecific,
    sourceMode,
    setSourceMode,
    synapseEditorContent,
    setSynapseEditorContent,
    policyAttributes,
    onDuplicateIntoEditor,
    duplicating,
    onSavePolicy,
    saveDisabled,
    saving,
}) => {

    const intl = useIntl();
    const { api } = useContext<any>(ApiContext);
    const normalizedSupportedGateways = Array.isArray(supportedGateways) ? supportedGateways : [];
    const isPolicyHubGatewayPolicy = normalizedSupportedGateways.includes(CONSTS.GATEWAY_TYPE.apiPlatform);
    const [workspaceOpen, setWorkspaceOpen] = useState(false);
    const [compactEditorHovered, setCompactEditorHovered] = useState(false);
    const workspaceRef = useRef<PolicyEditorWorkspaceHandle>(null);
    const [testResult, setTestResult] = useState<PolicyTestResponse | null>(null);
    // True when the editor content changed since `testResult` was produced (see TestPanel's
    // content-revision guard) - the result stays visible (with its own warning banner) but the
    // diagram's trace overlay is hidden immediately, since nodeIds may no longer match.
    const [isResultStale, setIsResultStale] = useState(false);
    const { data: settings } = usePublisherSettings();
    const testEnabled = Boolean((settings as any)?.operationPolicyTestEnabled);
    const attributeNames = (policyAttributes || [])
        .map((attribute) => attribute.name)
        .filter((name): name is string => Boolean(name));
    const attributeValues = (policyAttributes || []).reduce((acc: Record<string, any>, attribute) => {
        if (attribute.name) {
            acc[attribute.name] = attribute.defaultValue ?? '';
        }
        return acc;
    }, {});
    const parseResult = useMemo(
        () => parseSynapseXml(synapseEditorContent || ''),
        [synapseEditorContent],
    );
    const testStorageKey = `apim.policy-test-inputs.${isAPISpecific ? (api?.id || 'unsaved-api') : 'common'}`
        + `.${policyId || 'draft'}`;
    const execution = testResult?.execution;
    // Stale results keep the panel (see TestPanel/TestResults) but never the diagram overlay -
    // its nodeIds may no longer match the (since-edited) content.
    const executionTrace = isResultStale
        ? undefined
        : execution?.trace?.map((t) => ({ nodeId: t.nodeId, order: t.order }));
    const endedAtNodeId = !isResultStale && execution?.status === 'RESPONDED'
        && execution?.trace && execution.trace.length > 0
        ? execution.trace[execution.trace.length - 1].nodeId
        : undefined;
    const faultNodeId = !isResultStale && execution?.status === 'FAULT'
        ? (execution?.fault?.nodeId || (execution?.trace && execution.trace.length > 0
            ? execution.trace[execution.trace.length - 1].nodeId
            : undefined))
        : undefined;

    const handleSelectResultNode = (nodeId: string) => {
        workspaceRef.current?.revealNode(nodeId);
    };
    const handleRevealResultLine = (line: number) => {
        workspaceRef.current?.revealLine(line);
    };
    const handleClearResults = () => {
        setTestResult(null);
        setIsResultStale(false);
    };

    /**
     * Wired to the editor workspace's header "Save policy" button. Reuses the form's own save
     * path (`onSavePolicy`, i.e. PolicyCreateForm's `onPolicySave`) so it behaves exactly like the
     * form's Save button. If the form is currently invalid, saving from the editor isn't possible
     * (the form itself needs to show its per-field validation), so this just closes the editor
     * and surfaces a snackbar instead of calling the save path.
     */
    const handleWorkspaceSave = () => {
        if (saveDisabled) {
            setWorkspaceOpen(false);
            Alert.warning(intl.formatMessage({
                id: 'Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.save.validation',
                defaultMessage: 'Fill in the required fields to save',
            }));
            return;
        }
        if (onSavePolicy) {
            onSavePolicy();
        }
    };

    /**
     * Wires the "Add {{var}} as attribute" chip in the editor workspace to the policy create
     * form's reducer (see PolicyCreateForm.tsx ACTIONS.ADD_POLICY_ATTRIBUTE_WITH_NAME).
     * @param {string} name Jinja variable name detected in the editor content
     */
    const handleAddAttribute = (name: string) => {
        if (dispatch) {
            dispatch({ type: ACTIONS.ADD_POLICY_ATTRIBUTE_WITH_NAME, name });
        }
    };

    /**
     * Function to handle supported gateways related checkbox changes
     * @param {React.ChangeEvent<HTMLInputElement>} event event
     */
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (dispatch) {
            dispatch({
                type: ACTIONS.UPDATE_SUPPORTED_GATEWAYS,
                name:
                    event.target.name === 'regularGateway'
                        ? CONSTS.GATEWAY_TYPE.synapse
                        : CONSTS.GATEWAY_TYPE.choreoConnect,
                checked: event.target.checked,
            });
        }
    };

    /**
     * Hanlde policy download
     */
    const handlePolicyDownload = () => {
        if (policyId) {
            if (isAPISpecific) {
                const apiPolicyContentPromise = API.getOperationPolicyContent(
                    policyId,
                    api.id,
                );
                apiPolicyContentPromise
                    .then((apiPolicyResponse) => {
                        Utils.forceDownload(apiPolicyResponse);
                    })
                    .catch((error) => {
                        console.error(error);
                        Alert.error(
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.SourceDetails.apiSpecificPolicy.download.error'
                                defaultMessage='Something went wrong while downloading the policy'
                            />,
                        );
                    });
            } else {
                const commonPolicyContentPromise =
                    API.getCommonOperationPolicyContent(policyId);
                commonPolicyContentPromise
                    .then((commonPolicyResponse) => {
                        Utils.forceDownload(commonPolicyResponse);
                    })
                    .catch((error) => {
                        console.error(error);
                        Alert.error(
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.SourceDetails.commonPolicy.download.error'
                                defaultMessage='Something went wrong while downloading the policy'
                            />,
                        );
                    });
            }
        }
    };

    /**
     * Renders the policy file upload related section
     * @param {any[]} policyFile Policy file
     * @param {React.Dispatch<React.SetStateAction<any[]>>} setPolicyFile Policy file setter
     * @param {string} gateway Gateway type
     * @returns {TSX} Policy upload section
     */
    const renderPolicyFileUpload = (
        policyFile: any[],
        setPolicyFile: React.Dispatch<React.SetStateAction<any[]>>,
    ) => {
        return (
            <UploadPolicyDropzone
                policyDefinitionFile={policyFile}
                setPolicyDefinitionFile={setPolicyFile}
            />
        );
    };

    /**
     * Renders the "Upload file" / "Write in editor" tabs used when creating a Synapse policy
     * (only when the parent wires sourceMode/setSourceMode - see PolicyCreateForm.tsx). Falls
     * back to the plain dropzone otherwise so any other caller of SourceDetails keeps compiling.
     * @returns {TSX} The source-mode aware policy file section
     */
    const renderSynapseSourceSection = () => {
        if (!setSourceMode || !setSynapseEditorContent) {
            if (!synapsePolicyDefinitionFile || !setSynapsePolicyDefinitionFile) {
                return null;
            }
            return renderPolicyFileUpload(synapsePolicyDefinitionFile, setSynapsePolicyDefinitionFile);
        }
        const currentMode = sourceMode || 'editor';
        return (
            <Box>
                <Tabs
                    value={currentMode}
                    onChange={(_e, newMode) => setSourceMode(newMode)}
                    sx={{ mb: 1 }}
                >
                    <Tab
                        value='editor'
                        label={
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.SourceDetails.tab.editor'
                                defaultMessage='Write in editor'
                            />
                        }
                        data-testid='policy-source-tab-editor'
                    />
                    <Tab
                        value='upload'
                        label={
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.SourceDetails.tab.upload'
                                defaultMessage='Upload file'
                            />
                        }
                        data-testid='policy-source-tab-upload'
                    />
                </Tabs>
                {currentMode === 'upload' && synapsePolicyDefinitionFile && setSynapsePolicyDefinitionFile && (
                    renderPolicyFileUpload(synapsePolicyDefinitionFile, setSynapsePolicyDefinitionFile)
                )}
                {currentMode === 'editor' && (
                    <Box mt={2} mb={3}>
                        {/* A single bordered card: a thin header toolbar (caption left, the
                            primary "Open full editor" action right) sitting flush above the
                            compact Monaco editor, so the action reads as part of this block
                            instead of a stray outlined button hanging below it. */}
                        <Paper
                            variant='outlined'
                            sx={{
                                borderRadius: 2,
                                overflow: 'hidden',
                                position: 'relative',
                            }}
                            data-testid='policy-compact-editor-card'
                        >
                            <Box
                                display='flex'
                                alignItems='center'
                                justifyContent='space-between'
                                px={1.5}
                                py={0.75}
                                sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
                            >
                                <Typography variant='caption' color='text.secondary' data-testid='policy-compact-editor-caption'>
                                    {parseResult.errors.length > 0 ? (
                                        <FormattedMessage
                                            id='Apis.Details.Policies.PolicyForm.SourceDetails.compact.editor.errors'
                                            defaultMessage='{count} error(s)'
                                            values={{ count: parseResult.errors.length }}
                                        />
                                    ) : (synapseEditorContent || '').trim() === '' ? (
                                        <FormattedMessage
                                            id='Apis.Details.Policies.PolicyForm.SourceDetails.compact.editor.caption'
                                            defaultMessage='policy.j2 · Synapse'
                                        />
                                    ) : (
                                        <FormattedMessage
                                            id='Apis.Details.Policies.PolicyForm.SourceDetails.compact.editor.mediatorCount'
                                            defaultMessage='{count} mediator(s)'
                                            values={{ count: parseResult.nodes.length }}
                                        />
                                    )}
                                </Typography>
                                <Button
                                    size='small'
                                    variant='contained'
                                    disableElevation
                                    startIcon={<OpenInFullIcon fontSize='small' />}
                                    onClick={() => setWorkspaceOpen(true)}
                                    data-testid='open-full-policy-editor-btn'
                                >
                                    <FormattedMessage
                                        id='Apis.Details.Policies.PolicyForm.SourceDetails.open.full.editor'
                                        defaultMessage='Open full editor'
                                    />
                                </Button>
                            </Box>
                            <Box
                                role='button'
                                tabIndex={0}
                                aria-label='open-full-policy-editor-overlay'
                                onClick={() => setWorkspaceOpen(true)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setWorkspaceOpen(true);
                                    }
                                }}
                                onMouseEnter={() => setCompactEditorHovered(true)}
                                onMouseLeave={() => setCompactEditorHovered(false)}
                                sx={{
                                    position: 'relative',
                                    minHeight: 180,
                                    maxHeight: 320,
                                    height: 220,
                                    cursor: 'pointer',
                                }}
                                data-testid='policy-compact-editor-body'
                            >
                                <PolicyCodeEditor
                                    value={synapseEditorContent || ''}
                                    onChange={setSynapseEditorContent}
                                    attributeNames={attributeNames}
                                />
                                {(synapseEditorContent || '').trim() === '' && (
                                    <Box
                                        sx={{
                                            position: 'absolute',
                                            inset: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            px: 4,
                                            textAlign: 'center',
                                            pointerEvents: 'none',
                                        }}
                                        data-testid='policy-compact-editor-empty-state'
                                    >
                                        <Typography variant='body2' color='text.secondary'>
                                            <FormattedMessage
                                                id='Apis.Details.Policies.PolicyForm.SourceDetails.compact.editor.empty'
                                                defaultMessage={'Start typing or open the full editor to use '
                                                    + 'templates and the mediator palette'}
                                            />
                                        </Typography>
                                    </Box>
                                )}
                                {/* Subtle hover hint - a reminder that the compact editor itself
                                    opens the full workspace, without adding a second visible
                                    button. Purely decorative (aria-hidden); the actual click
                                    target is the overlay Box above. */}
                                <Box
                                    aria-hidden='true'
                                    sx={{
                                        position: 'absolute',
                                        bottom: 8,
                                        right: 8,
                                        px: 1,
                                        py: 0.25,
                                        borderRadius: 1,
                                        bgcolor: 'rgba(0,0,0,0.6)',
                                        color: 'common.white',
                                        fontSize: 12,
                                        opacity: compactEditorHovered ? 1 : 0,
                                        transition: 'opacity 0.15s ease',
                                        pointerEvents: 'none',
                                    }}
                                >
                                    <FormattedMessage
                                        id='Apis.Details.Policies.PolicyForm.SourceDetails.compact.editor.hoverHint'
                                        defaultMessage='Open full editor ⤢'
                                    />
                                </Box>
                            </Box>
                        </Paper>
                        <PolicyEditorWorkspace
                            ref={workspaceRef}
                            open={workspaceOpen}
                            onClose={() => setWorkspaceOpen(false)}
                            value={synapseEditorContent || ''}
                            onChange={setSynapseEditorContent}
                            attributeNames={attributeNames}
                            attributeValues={attributeValues}
                            onAddAttribute={handleAddAttribute}
                            onSavePolicy={onSavePolicy ? handleWorkspaceSave : undefined}
                            saving={saving}
                            trace={executionTrace}
                            endedAtNodeId={endedAtNodeId}
                            faultNodeId={faultNodeId}
                            onClearResults={handleClearResults}
                            testDisabledReason={testEnabled ? undefined : (
                                "Policy testing is disabled on this server. Ask an administrator to "
                                + 'enable the operation policy sandbox.'
                            )}
                            testPanel={testEnabled ? (
                                <TestPanel
                                    policyDefinition={synapseEditorContent || ''}
                                    policyAttributes={policyAttributes || []}
                                    detectedVariables={parseResult.detectedVariables}
                                    flowNodes={parseResult.nodes}
                                    attributeValues={attributeValues}
                                    storageKey={testStorageKey}
                                    onResult={setTestResult}
                                    onStaleChange={setIsResultStale}
                                    onSelectNode={handleSelectResultNode}
                                    onRevealLine={handleRevealResultLine}
                                />
                            ) : undefined}
                        />
                    </Box>
                )}
            </Box>
        );
    };

    /**
     *
     * @returns {TSX} Policy download section
     */
    const renderPolicyDownload = () => {
        if (isPolicyHubGatewayPolicy) {
            return null;
        }
        return <>
            <StyledBox display='flex' flexDirection='row' alignItems='center'>
                <Typography
                    color='inherit'
                    variant='subtitle2'
                    component='div'
                >
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.SourceDetails.form.policy.file.title'
                        defaultMessage='Policy File(s)'
                    />
                    <sup className={classes.mandatoryStar}>*</sup>
                </Typography>
            </StyledBox>
            <Typography color='inherit' variant='caption' component='p'>
                <FormattedMessage
                    id='Apis.Details.Policies.PolicyForm.SourceDetails.form.policy.file.description'
                    defaultMessage='Policy file contains the business logic of the policy'
                />
            </Typography>
            <Box
                flex='1'
                display='flex'
                flexDirection='row'
                justifyContent='left'
                mt={3}
                mb={3}
                gap={1}
            >
                <Button
                    aria-label='download-policy'
                    variant='contained'
                    data-testid='download-policy-file'
                    size='large'
                    color='primary'
                    onClick={handlePolicyDownload}
                    endIcon={<CloudDownloadIcon />}
                >
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.SourceDetails.form.policy.file.download'
                        defaultMessage='Download Policy'
                    />
                </Button>
                {onDuplicateIntoEditor && (
                    <Button
                        aria-label='duplicate-policy-into-editor'
                        variant='outlined'
                        data-testid='duplicate-policy-into-editor'
                        size='large'
                        color='primary'
                        disabled={Boolean(duplicating)}
                        onClick={onDuplicateIntoEditor}
                        endIcon={<ContentCopyIcon />}
                    >
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.SourceDetails.form.policy.file.duplicate'
                            defaultMessage='Duplicate into editor'
                        />
                    </Button>
                )}
            </Box>
        </>;
    }

    return (
        <Box display='flex' flexDirection='row' mt={1} data-testid='gateway-details-panel'>
            <Box width='40%' pt={3} mb={2}>
                <Box width='90%'>
                    <Typography
                        color='inherit'
                        variant='subtitle2'
                        component='div'
                    >
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.SourceDetails.title'
                            defaultMessage='Gateway Specific Details'
                        />
                    </Typography>
                    <Typography color='inherit' variant='caption' component='p'>
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.SourceDetails.description'
                            defaultMessage={
                                'Define the Gateway (s) that will be supporting this policy. ' +
                                'Based off of this selection, you can upload the relevant business ' +
                                'logic inclusive policy file.'
                            }
                        />
                    </Typography>
                </Box>
            </Box>
            <Box width='60%'>
                {/* Render the upload/editor source section for policy file authoring */}
                {normalizedSupportedGateways.includes(CONSTS.GATEWAY_TYPE.synapse) &&
                    !isViewMode &&
                    renderSynapseSourceSection()}

                {/* Render policy file download option in view mode */}
                {isViewMode && renderPolicyDownload()}
            </Box>
        </Box>
    );
};

export default React.memo(SourceDetails);
