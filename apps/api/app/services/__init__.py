"""Service layer: orchestration between routers and repositories. For CRUD
that has no extra business logic this is a pure pass-through; it exists so
that routers never talk to repositories/pyodbc directly.
"""
