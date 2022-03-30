import { v1APIHandler } from 'shared/api/handler-types';
import {
    FetchRecordsForLinkedRecordsSelectorInput,
    FetchRecordsForLinkedRecordsSelectorOutput,
} from 'shared/api/types/fetchRecordsForLinkedRecordsSelector';

import { fetchAirtableRecordsRESTApi } from '../../airtable';
import { fetchFieldsForTable } from '../../base-schema/fetchFieldsForTable';
import { getPrimaryFieldInFields } from '../../base-schema/getPrimaryFieldInFields';
import { fetchExtensionAndVerifyPassword } from '../../database/extensions/fetchExtension';
import { getFieldsNamesToFetchForLinkedRecordsAndFieldNamesToOverride } from '../../helpers/getFieldsNamesToFetchForLinkedRecords';
import { getNameFromMiniExtFieldWithConfig } from 'shared/extensions/miniExt-field-configs/id-helpers';
import {
    getLinkedRecordConfigInFields,
    getOverridedTitleAndSubtitleFields,
} from './utils';

export const fetchRecordsForLinkedRecordsSelector: v1APIHandler<
    FetchRecordsForLinkedRecordsSelectorInput,
    FetchRecordsForLinkedRecordsSelectorOutput
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
    });

    const linkedRecordFieldInMainTableResult = getLinkedRecordConfigInFields(
        airtableFieldsInMainTable
    );

    if (!linkedRecordFieldInMainTableResult) {
        throw new Error(
            'Could not fetch records because the linked records field was not found in the table.'
        );
    }

    const { linkedRecordFieldConfig, linkedRecordFieldIdInMainTable } =
        linkedRecordFieldInMainTableResult;

    const { titleOverrideFieldId, subtitleFieldId, linkedTableId } =
        linkedRecordFieldConfig.options;

    const { fields: airtableFieldsInLinkedTable } = await fetchFieldsForTable({
        userUID: extension.userUID,
        baseId: extension.baseId,
        tableId: linkedTableId,
    });

    const primaryFieldInLinkedTable = getPrimaryFieldInFields({
        fields: airtableFieldsInLinkedTable,
    });

    // Filter and sort based on the user's view from the linked records field config.
    const viewPart = linkedRecordFieldConfig.options.viewIdForRecordSelection
        ? {
              view: linkedRecordFieldConfig.options.viewIdForRecordSelection,
          }
        : {};

    const linkedRecordsAirtableField = airtableFieldsInMainTable.find(
        (field) => field.name === args.linkedRecordFieldName
    );

    if (!linkedRecordsAirtableField)
        throw new Error('Linked records field not found.');

    const linkedRecordFieldIdsInMainTable = [linkedRecordFieldIdInMainTable];

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

    // We need fieldNamesToOverride because later it helps to identify the fields and get their values
    // to replace with de originals
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

    const miniExtFieldWithConfig = extension.state.formFields.find(
        (field) =>
            getNameFromMiniExtFieldWithConfig(field) ===
            args.linkedRecordFieldName
    );

    if (!miniExtFieldWithConfig) {
        throw new Error(
            'Could not fetch records because the linked records field was not found in the table.'
        );
    }

    const { titleOverrideFieldName, subtitleFieldName } = fieldNamesToOverride;

    const primaryFieldName = titleOverrideFieldName
        ? titleOverrideFieldName
        : primaryFieldInLinkedTable.name;

    const { records: linkedTableRecords, offset } =
        await fetchAirtableRecordsRESTApi({
            userUID: extension.userUID,
            baseId: extension.baseId,
            tableId: linkedTableId,
            selectOptions: {
                ...viewPart,
                fields: fieldNamesToFetch,
                filterByFormula: `AND(${
                    args.searchTerm !== ''
                        ? `SEARCH(LOWER("${args.searchTerm}"), LOWER(${primaryFieldName}))`
                        : '1'
                })`,
                sort: [{ field: primaryFieldName }],
            },
            offset: args.offset,
        });

    const linkedRecords = linkedTableRecords;

    for (const record of linkedRecords) {
        const fieldNames = Object.keys(record.fields);
        for (const fieldName of fieldNames) {
            if (!fieldNamesToFetch.includes(fieldName)) {
                // When we fetch the records, we already only ask Airtable for the primary field and lookup field's
                // values. But, just in case, we loop over the fields again and remove anything if it exists.
                // Data security is of extreme importance, we should be paranoid
                delete record.fields[fieldName];
            }
        }
    }

    const linkedRecordsOnlyWithNameAndSubtitle = linkedRecords.map(
        (linkedRecord) => {
            const { fields } = linkedRecord;
            const fieldsWithNameAndSubtitle =
                getOverridedTitleAndSubtitleFields({
                    fields,
                    primaryFieldNameInLinkedTable:
                        primaryFieldInLinkedTable.name,
                    titleOverrideFieldName,
                    subtitleFieldName,
                });
            return {
                id: linkedRecord.id,
                fields: fieldsWithNameAndSubtitle,
            };
        }
    );

    return {
        records: linkedRecordsOnlyWithNameAndSubtitle,
        offset,
    };
};

export const handler = fetchRecordsForLinkedRecordsSelector;
