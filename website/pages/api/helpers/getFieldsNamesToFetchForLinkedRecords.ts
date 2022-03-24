import { FieldType } from '@airtable/blocks/models';
import { AirtableField, FieldNamesToFields } from 'shared/airtable/types';
import { getNameFromMiniExtFieldWithConfig } from 'shared/extensions/miniExt-field-configs/id-helpers';
import { Extension } from 'shared/generated/extension-versions/current/extension';
import { AllFieldIdsToFieldNamesInBase } from 'shared/types/linkedRecordsIdsToPrimaryValues';
import { makeNeedToSyncBaseErrorMessage } from '../../../utils/makeNeedToSyncBaseErrorMessage';

type Params = {
    extension: Extension;
    allFieldIdsToFieldNamesInBase: AllFieldIdsToFieldNamesInBase;
    primaryFieldInLinkedTable: AirtableField;
    airtableFieldsInLinkedTable: AirtableField[];
    airtableFieldsInMainTable: AirtableField[];
    /**
     * These are the field ids that are nested within the miniExt config
     * of the linked record's field in the main table.
     *
     * These field ids can be for fields in the main table, or in the linked table.
     */
    fieldIdsNestedInMiniExtLinkedRecordFieldConfig: string[];
    /**
     * The IDs of the linked record fields in the main table
     * that need those records that will be fetched.
     *
     * IMPORTANT: This is not all of the linked records in the main table.
     */
    linkedRecordFieldIdsInMainTable: string[];
    titleOverrideFieldId: string | null;
    subtitleFieldId: string | null;
};

/**
 *
 * @param args
 * @returns return names of primary field, display field and lookup fields if they exist for linked records
 */

type FieldNamesToOverride = {
    titleOverrideFieldName?: string;
    subtitleFieldName?: string;
};

export const getFieldsNamesToFetchForLinkedRecordsAndFieldNamesToOverride: (
    args: Params
) => Promise<{
    fieldNamesToFetch: string[];
    fieldNamesToOverride: FieldNamesToOverride;
}> = async ({
    extension,
    allFieldIdsToFieldNamesInBase,
    linkedRecordFieldIdsInMainTable,
    primaryFieldInLinkedTable,
    airtableFieldsInMainTable,
    airtableFieldsInLinkedTable,
    fieldIdsNestedInMiniExtLinkedRecordFieldConfig,
    titleOverrideFieldId,
    subtitleFieldId,
}) => {
    const fieldNamesToAirtableFields = airtableFieldsInMainTable.reduce(
        (acc, curr) => {
            acc[curr.name] = curr;
            return acc;
        },
        {} as FieldNamesToFields
    );

    const fieldsNamesToFetch: Set<string> = new Set([
        primaryFieldInLinkedTable.name,
    ]);

    for (const field of extension.state.formFields) {
        const airtableField =
            fieldNamesToAirtableFields[
                getNameFromMiniExtFieldWithConfig(field)
            ];

        if (airtableField.config.type === FieldType.MULTIPLE_LOOKUP_VALUES) {
            if (!airtableField) {
                throw new Error(
                    makeNeedToSyncBaseErrorMessage(
                        `Unable to find field '${getNameFromMiniExtFieldWithConfig(
                            field
                        )}' in Airtable.`
                    )
                );
            }

            if (airtableField.config.type !== airtableField.config.type) {
                throw new Error(
                    makeNeedToSyncBaseErrorMessage(
                        `Field '${airtableField.name}' in form doesn't match the same field in Airtable.`
                    )
                );
            }

            if (
                !linkedRecordFieldIdsInMainTable.includes(
                    airtableField.config.options.recordLinkFieldId
                )
            ) {
                // This field is not linked to the linked record field that we are fetching.
                continue;
            }

            const fieldIdToAdd =
                airtableField.config.options.fieldIdInLinkedTable;

            if (fieldIdToAdd) {
                const fieldNameToAdd =
                    allFieldIdsToFieldNamesInBase[fieldIdToAdd];

                if (fieldNameToAdd) {
                    fieldsNamesToFetch.add(fieldNameToAdd);
                }
            }
        }
    }

    const fieldNamesToOverride: FieldNamesToOverride = {};

    if (titleOverrideFieldId) {
        const titleOverrideFieldName =
            allFieldIdsToFieldNamesInBase[titleOverrideFieldId];
        if (titleOverrideFieldName) {
            fieldsNamesToFetch.add(titleOverrideFieldName);
            fieldNamesToOverride.titleOverrideFieldName =
                titleOverrideFieldName;
        }
    }

    if (subtitleFieldId) {
        const subtitleFieldName =
            allFieldIdsToFieldNamesInBase[subtitleFieldId];
        if (subtitleFieldName) {
            fieldsNamesToFetch.add(subtitleFieldName);
            fieldNamesToOverride.subtitleFieldName = subtitleFieldName;
        }
    }

    const fieldIdsNestedInMiniExtLinkedRecordFieldConfigSet = new Set(
        fieldIdsNestedInMiniExtLinkedRecordFieldConfig
    );

    // Account for fields that are nested in the miniExt config of the linked record field
    // so that we fetch them from the linked table
    for (const field of airtableFieldsInLinkedTable) {
        if (fieldIdsNestedInMiniExtLinkedRecordFieldConfigSet.has(field.id)) {
            fieldsNamesToFetch.add(field.name);
        }
    }

    return { fieldNamesToFetch: [...fieldsNamesToFetch], fieldNamesToOverride };
};
