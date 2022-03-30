import { FieldType } from '@airtable/blocks/models';
import {
    AirtableField,
    AirtableFieldSet,
    AirtableLinkedRecordField,
} from 'shared/airtable/types';

export const getLinkedRecordConfigInFields = (
    fields: AirtableField[]
): {
    linkedRecordFieldConfig: AirtableLinkedRecordField['config'];
    linkedRecordFieldIdInMainTable: string;
} | null => {
    for (const field of fields) {
        if (field.config.type === FieldType.MULTIPLE_RECORD_LINKS)
            return {
                linkedRecordFieldConfig: field.config,
                linkedRecordFieldIdInMainTable: field.id,
            };
    }
    return null;
};

export const getOverridedTitleAndSubtitleFields = ({
    fields,
    primaryFieldNameInLinkedTable,
    titleOverrideFieldName,
    subtitleFieldName,
}: {
    fields: AirtableFieldSet;
    primaryFieldNameInLinkedTable: string;
    titleOverrideFieldName?: string;
    subtitleFieldName?: string;
}) => {
    const title = titleOverrideFieldName
        ? fields[titleOverrideFieldName]
        : fields[primaryFieldNameInLinkedTable];

    const fieldsWithNameAndSubtitle = subtitleFieldName
        ? {
              Name: title,
              subtitle: fields[subtitleFieldName],
          }
        : {
              Name: title,
          };
    return fieldsWithNameAndSubtitle;
};
