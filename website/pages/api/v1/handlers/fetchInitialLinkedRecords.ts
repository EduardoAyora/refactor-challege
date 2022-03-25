import { FieldType } from '@airtable/blocks/models';
import {
    AirtableField,
    AirtableLinkedRecordField,
} from 'shared/airtable/types';
import { v1APIHandler } from 'shared/api/handler-types';
import {
    FetchInitialLinkedRecordsInput,
    FetchInitialLinkedRecordsOutput,
} from 'shared/api/types/fetchAllLinkedRecordPrimaryValues';
import {
    FieldIdsToAirtableFields,
    LinkedRecordIdsToAirtableRecords,
} from 'shared/types/linkedRecordsIdsToPrimaryValues';
import { chunkArray } from 'shared/utils/chunkArray';

import { fetchFieldsForTable } from '../../base-schema/fetchFieldsForTable';
import { getPrimaryFieldInFields } from '../../base-schema/getPrimaryFieldInFields';
import { fetchExtensionAndVerifyPassword } from '../../database/extensions/fetchExtension';
import { fetchLinkedRecords } from '../../helpers/fetchLinkedRecords';
import { getFieldsNamesToFetchForLinkedRecordsAndFieldNamesToOverride } from '../../helpers/getFieldsNamesToFetchForLinkedRecords';

const getLinkedRecordConfig = (
    fields: AirtableField[]
): AirtableLinkedRecordField['config'] | null => {
    for (const field of fields) {
        if (field.config.type === FieldType.MULTIPLE_RECORD_LINKS)
            return field.config;
    }
    return null;
};

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

    const linkedRecordFieldConfig = getLinkedRecordConfig(
        airtableFieldsInMainTable
    );

    if (!linkedRecordFieldConfig) {
        throw new Error(
            'Could not fetch records because the linked records field was not found in the table.'
        );
    }

    const {
        options: { titleOverrideFieldId, subtitleFieldId },
    } = linkedRecordFieldConfig;

    let linkedRecordIdsToAirtableRecords: LinkedRecordIdsToAirtableRecords = {};

    for (const linkedTableId of Object.keys(args.linkedTableIdsToRecordIds)) {
        const { recordIds, linkedRecordFieldIdsInMainTable } =
            args.linkedTableIdsToRecordIds[linkedTableId];

        const { fields: airtableFieldsInLinkedTable } =
            await fetchFieldsForTable({
                userUID: extension.userUID,
                baseId: extension.baseId,
                tableId: linkedTableId,
                totalRemainingTriesToResolveLookupLinkedRecordFields: 3,
            });

        const currentLinkedTableFieldsIdsToAirtableFields: FieldIdsToAirtableFields =
            {};

        airtableFieldsInLinkedTable.forEach((field) => {
            currentLinkedTableFieldsIdsToAirtableFields[field.id] = field;
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

        if (recordIds.length > 0) {
            const nestedRecordsIds =
                recordIds.length > 100
                    ? chunkArray(recordIds, 100)
                    : [recordIds];

            for (const recordIds of nestedRecordsIds) {
                const moreLinkedRecordsWithLinks = await fetchLinkedRecords({
                    tableId: linkedTableId,
                    baseId: extension.baseId,
                    userUID: extension.userUID,
                    fieldNamesToFetch,
                    recordIds,
                });

                for (const recordId of Object.keys(
                    moreLinkedRecordsWithLinks
                )) {
                    const { fields } = moreLinkedRecordsWithLinks[recordId];
                    const { titleOverrideFieldName, subtitleFieldName } =
                        fieldNamesToOverride;

                    const title = titleOverrideFieldName
                        ? fields[titleOverrideFieldName]
                        : fields[primaryFieldInLinkedTable.name];

                    const fieldsWithNameAndSubtitle = subtitleFieldName
                        ? {
                              Name: title,
                              subtitle: fields[subtitleFieldName],
                          }
                        : {
                              Name: title,
                          };

                    moreLinkedRecordsWithLinks[recordId].fields =
                        fieldsWithNameAndSubtitle;
                }

                linkedRecordIdsToAirtableRecords = {
                    ...linkedRecordIdsToAirtableRecords,
                    ...moreLinkedRecordsWithLinks,
                };
            }
        }
    }

    return {
        linkedRecordIdsToAirtableRecords,
    };
};

export const handler = fetchInitialLinkedRecords;
