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

import React from 'react';
import { SvgIconProps } from '@mui/material/SvgIcon';
import LabelOutlined from '@mui/icons-material/LabelOutlined';
import ViewHeadlineOutlined from '@mui/icons-material/ViewHeadlineOutlined';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import ArticleOutlined from '@mui/icons-material/ArticleOutlined';
import CallSplitOutlined from '@mui/icons-material/CallSplitOutlined';
import AltRouteOutlined from '@mui/icons-material/AltRouteOutlined';
import CallMadeOutlined from '@mui/icons-material/CallMadeOutlined';
import SendOutlined from '@mui/icons-material/SendOutlined';
import PhoneForwardedOutlined from '@mui/icons-material/PhoneForwardedOutlined';
import ReplyOutlined from '@mui/icons-material/ReplyOutlined';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import ReplayOutlined from '@mui/icons-material/ReplayOutlined';
import AddBoxOutlined from '@mui/icons-material/AddBoxOutlined';
import CodeOutlined from '@mui/icons-material/CodeOutlined';
import TransformOutlined from '@mui/icons-material/TransformOutlined';
import ExtensionOutlined from '@mui/icons-material/ExtensionOutlined';
import SpeedOutlined from '@mui/icons-material/SpeedOutlined';
import StorageOutlined from '@mui/icons-material/StorageOutlined';
import CallMergeOutlined from '@mui/icons-material/CallMergeOutlined';
import RepeatOutlined from '@mui/icons-material/RepeatOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import ListAltOutlined from '@mui/icons-material/ListAltOutlined';
import SettingsEthernetOutlined from '@mui/icons-material/SettingsEthernetOutlined';
import LayersOutlined from '@mui/icons-material/LayersOutlined';

/** Registry of the (small, fixed) set of icons the flow diagram/mediators palette needs, keyed by
 * the same string names used in `mediatorCatalog.tsx` - avoids a barrel import of the whole
 * `@mui/icons-material` package (thousands of icons) while still letting the catalog reference
 * icons by name. */
export const MEDIATOR_ICONS: Record<string, React.ComponentType<SvgIconProps>> = {
    LabelOutlined,
    ViewHeadlineOutlined,
    BuildOutlined,
    ArticleOutlined,
    CallSplitOutlined,
    AltRouteOutlined,
    CallMadeOutlined,
    SendOutlined,
    PhoneForwardedOutlined,
    ReplyOutlined,
    BlockOutlined,
    ReplayOutlined,
    AddBoxOutlined,
    CodeOutlined,
    TransformOutlined,
    ExtensionOutlined,
    SpeedOutlined,
    StorageOutlined,
    CallMergeOutlined,
    RepeatOutlined,
    FactCheckOutlined,
    ListAltOutlined,
    SettingsEthernetOutlined,
};

/**
 * Resolves a mediator's icon by name, falling back to a generic "layers" glyph when unknown.
 * @param {string} name Icon name, as stored in `mediatorCatalog.tsx`
 * @returns {React.ComponentType<SvgIconProps>} The icon component
 */
export function getMediatorIcon(name: string): React.ComponentType<SvgIconProps> {
    return MEDIATOR_ICONS[name] || LayersOutlined;
}

export default MEDIATOR_ICONS;
