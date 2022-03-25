import { FieldType } from '@airtable/blocks/models';
import {
    AirtableField,
    AirtableLinkedRecordField,
} from 'shared/airtable/types';

const searchLinkedRecordConfig = (
    fields: AirtableField[]
): AirtableLinkedRecordField['config'] | null => {
    for (const field of fields) {
        if (field.config.type === FieldType.MULTIPLE_RECORD_LINKS)
            return field.config;
    }
    return null;
};

export const getLinkedRecordConfig = (
    airtableFieldsInMainTable: AirtableField[]
): AirtableLinkedRecordField['config'] => {
    const linkedRecordFieldConfig = searchLinkedRecordConfig(
        airtableFieldsInMainTable
    );

    if (!linkedRecordFieldConfig) {
        throw new Error(
            'Could not fetch records because the linked records field was not found in the table.'
        );
    }

    return linkedRecordFieldConfig;
};
