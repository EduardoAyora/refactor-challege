import { AirtableRecord } from '../../airtable/types';

export type FetchRecordsForLinkedRecordsSelectorInput = {
    linkedRecordFieldName: string;
    searchTerm: string;
    offset: string | null;
};

export type FetchRecordsForLinkedRecordsSelectorOutput = {
    records: AirtableRecord[];
    offset: string | null;
};
