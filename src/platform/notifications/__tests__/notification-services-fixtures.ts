export interface MockTelegramUserRow {
  license_keys: string[];
  notifications_enabled: boolean;
  last_command: string;
  updated_at: number;
}

export function handlePgQuery(
  store: Map<number, MockTelegramUserRow>,
  sql: string,
  vals?: unknown[]
) {
  const s = typeof sql === 'string' ? sql.toLowerCase() : '';
  const uid = vals?.[0] as number | undefined;

  if (s.includes('on conflict')) {
    const id = vals?.[0] as number;
    store.set(id, {
      license_keys: (vals?.[1] as string[]) ?? [],
      notifications_enabled: (vals?.[2] as boolean) ?? true,
      last_command: (vals?.[3] as string) ?? '',
      updated_at: (vals?.[4] as number) ?? Date.now(),
    });
    return { rows: [{ user_id: id, ...store.get(id)! }], rowCount: 1, oid: 0, command: 'INSERT' };
  }

  const row = store.get(uid as number);
  if (!row) return { rows: [], rowCount: 0, oid: 0, command: 'SELECT' };
  return { rows: [{ user_id: uid, ...row }], rowCount: 1, oid: 0, command: 'SELECT' };
}
