"""Minimal pgvector field using the project's existing psycopg2 driver.

Vectors serialize using pgvector's text input syntax. SQLite storage is only for
unit tests; production retrieval requires PostgreSQL and the vector extension.
"""
import json
from django.db import models


class VectorField(models.Field):
    def db_type(self, connection):
        return 'vector' if connection.vendor == 'postgresql' else 'text'

    def get_prep_value(self, value):
        return json.dumps(value) if value is not None else None

    def from_db_value(self, value, expression, connection):
        return self.to_python(value)

    def to_python(self, value):
        return json.loads(value) if isinstance(value, str) else value
