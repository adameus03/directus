import type {
	Field,
	Relation,
	ApiCollection,
	SchemaOverview,
	Snapshot,
	SnapshotField,
	SnapshotRelation,
} from '@directus/types';
import { version } from 'directus/version';
import type { Knex } from 'knex';
import { fromPairs, isArray, isPlainObject, mapValues, omit, sortBy, toPairs } from 'lodash-es';
import getDatabase, { getDatabaseClient } from '../database/index.js';
import { CollectionsService } from '../services/collections.js';
import { FieldsService } from '../services/fields.js';
import { RelationsService } from '../services/relations.js';
import { getSchema } from './get-schema.js';
import { sanitizeCollection, sanitizeField, sanitizeRelation } from './sanitize-schema.js';

export async function getSnapshot(options?: { database?: Knex; schema?: SchemaOverview }): Promise<Snapshot> {
	const database = options?.database ?? getDatabase();
	const vendor = getDatabaseClient(database);
	const schema = options?.schema ?? (await getSchema({ database, bypassCache: true }));

	const collectionsService = new CollectionsService({ knex: database, schema });
	const fieldsService = new FieldsService({ knex: database, schema });
	const relationsService = new RelationsService({ knex: database, schema });

	const [collectionsRaw, fieldsRaw, relationsRaw] = await Promise.all([
		collectionsService.readByQuery(),
		fieldsService.readAll(),
		relationsService.readAll(),
	]);

	const collectionsFiltered = collectionsRaw.filter((item: any) => excludeSystem(item) && excludeUntracked(item));
	const fieldsFiltered = fieldsRaw.filter((item: any) => excludeSystem(item) && excludeUntracked(item));
	const relationsFiltered = relationsRaw.filter((item: any) => excludeSystem(item) && excludeUntracked(item));

	const collectionsSorted = sortBy(mapValues(collectionsFiltered, sortDeep), ['collection']);

	const fieldsSorted = sortBy(mapValues(fieldsFiltered, sortDeep), ['collection', 'meta.id']).map(
		omitID,
	) as SnapshotField[];

	const relationsSorted = sortBy(mapValues(relationsFiltered, sortDeep), ['collection', 'meta.id']).map(
		omitID,
	) as SnapshotRelation[];

	return {
		version: 1,
		directus: version,
		vendor,
		collections: collectionsSorted.map((collection) => sanitizeCollection(collection)) as ApiCollection[],
		fields: fieldsSorted.map((field) => sanitizeField(field)) as SnapshotField[],
		relations: relationsSorted.map((relation) => sanitizeRelation(relation)) as SnapshotRelation[],
	};
}

function excludeSystem(item: ApiCollection | Field | Relation) {
	if (item?.meta?.system === true) return false;
	return true;
}

function excludeUntracked(item: ApiCollection | Field | Relation) {
	if (item?.meta === null) return false;
	return true;
}

function omitID(item: Record<string, any>) {
	return omit(item, 'meta.id');
}

function sortDeep(raw: any): any {
	if (isPlainObject(raw)) {
		const mapped = mapValues(raw, sortDeep);
		const pairs = toPairs(mapped);
		const sorted = sortBy(pairs);
		return fromPairs(sorted);
	}

	if (isArray(raw)) {
		return raw.map((raw) => sortDeep(raw));
	}

	return raw;
}
