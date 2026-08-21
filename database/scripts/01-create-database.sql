-- 01-create-database.sql
-- Project: Citari
-- Creates the citari database from scratch.
-- Schema identifiers are in English.

USE master;
GO

IF EXISTS (SELECT name FROM sys.databases WHERE name = N'citari')
BEGIN
    ALTER DATABASE citari SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE citari;
END

CREATE DATABASE citari
COLLATE Latin1_General_CI_AI;
GO

USE citari;
GO

PRINT '[01-create-database] citari database created ... OK';
GO
