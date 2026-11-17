-- Local development only (runs once, when the Postgres volume is first created).
-- The app role must NOT be a superuser or table owner, otherwise RLS is bypassed.
CREATE ROLE qualify_app LOGIN PASSWORD 'qualify_app_dev_password';
