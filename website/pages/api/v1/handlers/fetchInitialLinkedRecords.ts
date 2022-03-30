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
    getLinkedRecordConfigInFields,
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

    const linkedRecordFieldInMainTableResult = getLinkedRecordConfigInFields(
        airtableFieldsInMainTable
    );

    if (!linkedRecordFieldInMainTableResult) {
        throw new Error(
            'Could not fetch records because the linked records field was not found in the table.'
        );
    }

    const {
        linkedRecordFieldConfig: {
            options: { titleOverrideFieldId, subtitleFieldId },
        },
    } = linkedRecordFieldInMainTableResult;

    const linkedTableIds = Object.keys(args.linkedTableIdsToRecordIds);

    const linkedRecordIdsToAirtableRecords: LinkedRecordIdsToAirtableRecords =
        await linkedTableIds.reduce(async (acc, linkedTableId) => {
            const { recordIds, linkedRecordFieldIdsInMainTable } =
                args.linkedTableIdsToRecordIds[linkedTableId];

            if (recordIds.length === 0) return acc;

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
                await getFieldsNamesToFetchForLinkedRecordsAndFieldNamesToOverride(
                    {
                        extension,
                        allFieldIdsToFieldNamesInBase,
                        primaryFieldInLinkedTable,
                        linkedRecordFieldIdsInMainTable,
                        airtableFieldsInMainTable,
                        airtableFieldsInLinkedTable,
                        fieldIdsNestedInMiniExtLinkedRecordFieldConfig,
                        titleOverrideFieldId,
                        subtitleFieldId,
                    }
                );

            const nestedRecordsIds =
                recordIds.length > 100
                    ? chunkArray(recordIds, 100)
                    : [recordIds];

            const nestedLinkedRecordIdsToAirtableRecords: LinkedRecordIdsToAirtableRecords =
                await nestedRecordsIds.reduce(async (acc, recordIds) => {
                    const moreLinkedRecordsWithLinks = await fetchLinkedRecords(
                        {
                            tableId: linkedTableId,
                            baseId: extension.baseId,
                            userUID: extension.userUID,
                            fieldNamesToFetch,
                            recordIds,
                        }
                    );

                    const recordIdsOfMoreLinkedRecords = Object.keys(
                        moreLinkedRecordsWithLinks
                    );

                    const moreLinkedRecordIdsToAirtableRecords: LinkedRecordIdsToAirtableRecords =
                        recordIdsOfMoreLinkedRecords.reduce((acc, recordId) => {
                            const { fields } =
                                moreLinkedRecordsWithLinks[recordId];
                            const {
                                titleOverrideFieldName,
                                subtitleFieldName,
                            } = fieldNamesToOverride;

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
                        }, {} as LinkedRecordIdsToAirtableRecords);

                    return {
                        ...acc,
                        ...moreLinkedRecordIdsToAirtableRecords,
                    };
                }, Promise.resolve({} as LinkedRecordIdsToAirtableRecords));
            return {
                ...acc,
                ...nestedLinkedRecordIdsToAirtableRecords,
            };
        }, Promise.resolve({} as LinkedRecordIdsToAirtableRecords));

    return {
        linkedRecordIdsToAirtableRecords,
    };
};

export const handler = fetchInitialLinkedRecords;
