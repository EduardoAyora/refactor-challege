import { v1APIHandler } from 'shared/api/handler-types';
import {
    FetchInitialLinkedRecordsInput,
    FetchInitialLinkedRecordsOutput,
} from 'shared/api/types/fetchAllLinkedRecordPrimaryValues';
import { LinkedRecordIdsToAirtableRecords } from 'shared/types/linkedRecordsIdsToPrimaryValues';
import { chunkArray } from 'shared/utils/chunkArray';

import { fetchFieldsForTable } from '../../base-schema/fetchFieldsForTable';
import { getPrimaryFieldInFields } from '../../base-schema/getPrimaryFieldInFields';
import { fetchExtensionAndVerifyPassword } from '../../database/extensions/fetchExtension';
import { fetchLinkedRecords } from '../../helpers/fetchLinkedRecords';
import { getFieldsNamesToFetchForLinkedRecordsAndFieldNamesToOverride } from '../../helpers/getFieldsNamesToFetchForLinkedRecords';
import {
    getLinkedRecordConfig,
    getOverridedTitleAndSubtitleFields,
} from './utils';

export const fetchInitialLinkedRecords: v1APIHandler<
    FetchInitialLinkedRecordsInput,
    FetchInitialLinkedRecordsOutput
> = async (args) => {
    const {
        extension,
        allFieldIdsToFieldNamesInBase,
        fieldIdsToNestedFieldIdsInMiniExtFieldConfigs,
    } = await fetchExtensionAndVerifyPassword();

    const { fields: airtableFieldsInMainTable } = await fetchFieldsForTable({
        userUID: extension.userUID,
        baseId: extension.baseId,
        tableId: extension.state.tableId,
        totalRemainingTriesToResolveLookupLinkedRecordFields: 3,
    });

    const {
        options: { titleOverrideFieldId, subtitleFieldId },
    } = getLinkedRecordConfig(airtableFieldsInMainTable);

    let linkedRecordIdsToAirtableRecords: LinkedRecordIdsToAirtableRecords = {};

    for (const linkedTableId of Object.keys(args.linkedTableIdsToRecordIds)) {
        const { recordIds, linkedRecordFieldIdsInMainTable } =
            args.linkedTableIdsToRecordIds[linkedTableId];

        if (recordIds.length === 0) continue;

        const { fields: airtableFieldsInLinkedTable } =
            await fetchFieldsForTable({
                userUID: extension.userUID,
                baseId: extension.baseId,
                tableId: linkedTableId,
                totalRemainingTriesToResolveLookupLinkedRecordFields: 3,
            });

        const primaryFieldInLinkedTable = getPrimaryFieldInFields({
            fields: airtableFieldsInLinkedTable,
        });

        const fieldIdsNestedInMiniExtLinkedRecordFieldConfig =
            linkedRecordFieldIdsInMainTable
                .map(
                    (linkedRecordFieldIdInMainTable) =>
                        fieldIdsToNestedFieldIdsInMiniExtFieldConfigs[
                            linkedRecordFieldIdInMainTable
                        ]
                )
                .flat()
                .filter(Boolean);

        const { fieldNamesToFetch, fieldNamesToOverride } =
            await getFieldsNamesToFetchForLinkedRecordsAndFieldNamesToOverride({
                extension,
                allFieldIdsToFieldNamesInBase,
                primaryFieldInLinkedTable,
                linkedRecordFieldIdsInMainTable,
                airtableFieldsInMainTable,
                airtableFieldsInLinkedTable,
                fieldIdsNestedInMiniExtLinkedRecordFieldConfig,
                titleOverrideFieldId,
                subtitleFieldId,
            });

        const nestedRecordsIds =
            recordIds.length > 100 ? chunkArray(recordIds, 100) : [recordIds];

        for (const recordIds of nestedRecordsIds) {
            const moreLinkedRecordsWithLinks = await fetchLinkedRecords({
                tableId: linkedTableId,
                baseId: extension.baseId,
                userUID: extension.userUID,
                fieldNamesToFetch,
                recordIds,
            });

            const moreLinkedRecordsWithLinksAndOverridedTitleAndSubtitle: LinkedRecordIdsToAirtableRecords =
                Object.keys(moreLinkedRecordsWithLinks).reduce(
                    (acc, recordId) => {
                        const { fields } = moreLinkedRecordsWithLinks[recordId];
                        const { titleOverrideFieldName, subtitleFieldName } =
                            fieldNamesToOverride;

                        const titleAndSubtitleFields =
                            getOverridedTitleAndSubtitleFields({
                                fields,
                                primaryFieldNameInLinkedTable:
                                    primaryFieldInLinkedTable.name,
                                titleOverrideFieldName,
                                subtitleFieldName,
                            });

                        return {
                            ...acc,
                            [recordId]: {
                                id: moreLinkedRecordsWithLinks[recordId].id,
                                fields: titleAndSubtitleFields,
                            },
                        };
                    },
                    {} as LinkedRecordIdsToAirtableRecords
                );

            linkedRecordIdsToAirtableRecords = {
                ...linkedRecordIdsToAirtableRecords,
                ...moreLinkedRecordsWithLinksAndOverridedTitleAndSubtitle,
            };
        }
    }

    return {
        linkedRecordIdsToAirtableRecords,
    };
};

export const handler = fetchInitialLinkedRecords;
