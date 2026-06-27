export function paginate(total: number, page: number, limit: number) {
  return { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
