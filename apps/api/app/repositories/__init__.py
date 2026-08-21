"""Repository layer: the only layer allowed to know about SQL/stored
procedures/views. Each class wraps a single pyodbc.Connection (handed in per
request via app.deps.get_db) and exposes typed methods that call
app.db.exec_sp / app.db.query_view.
"""
