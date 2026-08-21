"""Pure mapper functions: raw SQL row (dict, snake_case) -> API-shaped dict.

No I/O here. Callers (repositories/services) feed in the dict produced by
db.exec_sp / db.query_view (already built from cursor.description) and get
back a dict whose keys match the Pydantic schema field names in app/schemas
(which then render as camelCase over the wire via alias_generator=to_camel).
"""
