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

import React, { useContext, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import Icon from '@mui/material/Icon';
import IconButton from '@mui/material/IconButton';
import { useHistory } from 'react-router-dom';
import Alert from 'AppComponents/Shared/Alert';
import { Progress } from 'AppComponents/Shared';
import API from 'AppData/api';
import PolicyHub from 'AppData/PolicyHub';
import CONSTS from 'AppData/Constants';
import type { Policy, PolicySpec } from './Types';
import type { DuplicateIntoEditorPrefill } from './CreatePolicy';
import ApiContext from '../components/ApiContext';
import PolicyViewForm from './PolicyForm/PolicyViewForm';

interface ViewPolicyProps {
    handleDialogClose: () => void;
    dialogOpen: boolean;
    policyObj: Policy;
    isLocalToAPI: boolean;
    /** Set by PolicyList.tsx: when present and `isLocalToAPI`, "Duplicate into editor" calls this
     * with a prefill instead of navigating to the common policy create page, so the API-specific
     * "Add New Policy" dialog (CreatePolicy.tsx) reopens prefilled - see Issue 5 in the UX polish
     * pass: duplicating an API-specific policy used to always create a COMMON policy. */
    onDuplicateIntoEditor?: (prefill: DuplicateIntoEditorPrefill) => void;
}

/**
 * Renders the UI to view a policy selected from the policy list.
 * @param {JSON} props Input props from parent components.
 * @returns {TSX} Policy view UI.
 */
const ViewPolicy: React.FC<ViewPolicyProps> = ({
    handleDialogClose,
    dialogOpen,
    policyObj,
    isLocalToAPI,
    onDuplicateIntoEditor,
}) => {
    const { api } = useContext<any>(ApiContext);
    const history = useHistory();
    const [policySpec, setPolicySpec] = useState<PolicySpec | null>(null);
    const [loading, setLoading] = useState(false);
    const [duplicating, setDuplicating] = useState(false);
    const isPolicyHubGateway = api.gatewayType === CONSTS.GATEWAY_TYPE.apiPlatform;

    useEffect(() => {
        if (dialogOpen && isPolicyHubGateway) {
            setPolicySpec(null);
            setLoading(true);
            PolicyHub.getPolicySpec({
                name: policyObj.name,
                version: policyObj.version,
                displayName: policyObj.displayName,
            })
                .then((policyResponse) => {
                    if (policyResponse) {
                        setPolicySpec(policyResponse);
                    } else {
                        setPolicySpec(PolicyHub.toPolicySpec(policyObj));
                    }
                })
                .catch((error) => {
                    console.error(error);
                    setPolicySpec(PolicyHub.toPolicySpec(policyObj));
                    Alert.error('Something went wrong while retrieving policy details');
                })
                .finally(() => {
                    setLoading(false);
                });
        } else if (dialogOpen && isLocalToAPI) {
            setLoading(true);
            const promisedPolicyGet = API.getOperationPolicy(
                policyObj.id,
                api.id,
            );
            promisedPolicyGet
                .then((response) => {
                    setPolicySpec(response.body);
                })
                .catch((error) => {
                    console.error(error);
                    if (error.response) {
                        Alert.error(error.response.body.description);
                    } else {
                        Alert.error('Something went wrong while retrieving policy details');
                    }
                })
                .finally(() => {
                    setLoading(false);
                });
        } else if (dialogOpen && !isLocalToAPI) {
            const promisedCommonPolicyGet = API.getCommonOperationPolicy(
                policyObj.id,
            );
            promisedCommonPolicyGet
                .then((response) => {
                    setPolicySpec(response.body);
                })
                .catch((error) => {
                    console.error(error);
                    if (error.response) {
                        Alert.error(error.response.body.description);
                    } else {
                        Alert.error('Something went wrong while retrieving policy details');
                    }
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    }, [dialogOpen, isLocalToAPI, isPolicyHubGateway, policyObj, api.id]);

    const stopPropagation = (
        e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    ) => {
        e.stopPropagation();
    };

    const toggleOpen = () => {
        handleDialogClose();
    };

    /**
     * "Duplicate into editor". For an API-specific policy (`isLocalToAPI`), this reopens the
     * API-specific "Add New Policy" dialog (`CreatePolicy.tsx` in this folder, via the
     * `onDuplicateIntoEditor` callback threaded down from `PolicyList.tsx`) prefilled from this
     * policy's spec and raw .j2 definition - it must NOT create a COMMON policy (that was a Phase
     * 4 deviation: it used to always navigate to the common policy create page below). Common
     * policies keep navigating to the common policy create page, pre-filled via
     * `location.state.base` - see CommonPolicies/CreatePolicy.tsx.
     */
    const handleDuplicateIntoEditor = () => {
        if (!policySpec) return;
        setDuplicating(true);
        const definitionPromise = isLocalToAPI
            ? API.getAPISpecificOperationPolicyDefinition(policySpec.id, api.id)
            : API.getCommonOperationPolicyDefinition(policySpec.id);
        definitionPromise
            .then((response: any) => {
                handleDialogClose();
                if (isLocalToAPI && onDuplicateIntoEditor) {
                    onDuplicateIntoEditor({
                        displayName: policySpec.displayName,
                        version: policySpec.version,
                        description: policySpec.description,
                        applicableFlows: policySpec.applicableFlows,
                        supportedApiTypes: policySpec.supportedApiTypes as string[],
                        policyAttributes: policySpec.policyAttributes,
                        definition: response.body,
                    });
                    return;
                }
                history.push(CONSTS.PATH_TEMPLATES.COMMON_POLICY_CREATE, {
                    base: { spec: policySpec, definition: response.body },
                });
            })
            .catch((error: any) => {
                if (error?.message === 'OPERATION_NOT_AVAILABLE') {
                    Alert.info(
                        'Duplicating into the editor requires a newer Control Plane version '
                        + '(the policy definition endpoint is not available yet)',
                    );
                } else {
                    console.error(error);
                    Alert.error('Something went wrong while fetching the policy definition');
                }
            })
            .finally(() => {
                setDuplicating(false);
            });
    };

    if (loading) {
        return <Progress />;
    }

    if (!policySpec) {
        return <></>;
    }

    return <>
        <Dialog
            maxWidth='md'
            open={dialogOpen}
            aria-labelledby='form-dialog-title'
            onClose={handleDialogClose}
            onClick={stopPropagation}
            fullWidth
        >
            <Box
                display='flex'
                justifyContent='space-between'
                alignItems='center'
                flexDirection='row'
                px={3}
                pt={3}
            >
                <Box display='flex'>
                    <Typography variant='h4' component='h2'>
                        {policyObj.displayName}
                    </Typography>
                </Box>
                <Box display='flex'>
                    <IconButton color='inherit' onClick={toggleOpen} aria-label='Close' size='large'>
                        <Icon>close</Icon>
                    </IconButton>
                </Box>
            </Box>
            <DialogContent>
                <Box my={2}>
                    <DialogContentText>
                        <PolicyViewForm
                            policySpec={policySpec}
                            onDone={toggleOpen}
                            isLocalToAPI={isLocalToAPI}
                            apiType={api.type}
                            onDuplicateIntoEditor={handleDuplicateIntoEditor}
                            duplicating={duplicating}
                        />
                    </DialogContentText>
                </Box>
            </DialogContent>
        </Dialog>
    </>;
};

export default ViewPolicy;
