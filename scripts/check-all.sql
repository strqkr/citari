-- ============================================================
-- check-all.sql
-- Proyecto: Citari
-- Contenido: chequeo sanitario basico del schema - conteo de filas
--            por tabla (seed data) y conteo de objetos (tablas,
--            procedimientos, vistas).
-- Uso: sqlcmd -i check-all.sql (ver scripts/setup-db.sh para el
--      patron docker exec ... sqlcmd ... -C)
-- ============================================================

USE citari;
GO

SET NOCOUNT ON;

PRINT '[check-all] conteo de filas por tabla (minimo 50):';

DECLARE @c INT;

SELECT @c = COUNT(*) FROM tipos_negocios;
PRINT '[check-all] tipos_negocios ............... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM estados_dominios;
PRINT '[check-all] estados_dominios ............. ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM estados_reservaciones;
PRINT '[check-all] estados_reservaciones ........ ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM direcciones;
PRINT '[check-all] direcciones .................. ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM superadmins;
PRINT '[check-all] superadmins .................. ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM superadmins_correos;
PRINT '[check-all] superadmins_correos .......... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM dominios;
PRINT '[check-all] dominios ..................... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM dominios_correos;
PRINT '[check-all] dominios_correos ............. ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM dominios_telefonos;
PRINT '[check-all] dominios_telefonos ........... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM duenos_de_dominios;
PRINT '[check-all] duenos_de_dominios ........... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM duenos_de_dominios_correos;
PRINT '[check-all] duenos_de_dominios_correos ... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM duenos_de_dominios_telefonos;
PRINT '[check-all] duenos_de_dominios_telefonos . ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM clientes;
PRINT '[check-all] clientes ..................... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM clientes_correos;
PRINT '[check-all] clientes_correos ............. ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM clientes_telefonos;
PRINT '[check-all] clientes_telefonos ........... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM categorias_servicios;
PRINT '[check-all] categorias_servicios ......... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM servicios;
PRINT '[check-all] servicios .................... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM localidades;
PRINT '[check-all] localidades .................. ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM localidades_telefonos;
PRINT '[check-all] localidades_telefonos ........ ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM horarios;
PRINT '[check-all] horarios ..................... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM bloques_de_disponibilidad;
PRINT '[check-all] bloques_de_disponibilidad .... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM reservaciones;
PRINT '[check-all] reservaciones ................ ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM codigos_de_rastreos;
PRINT '[check-all] codigos_de_rastreos .......... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;
SELECT @c = COUNT(*) FROM registros;
PRINT '[check-all] registros .................... ' + CAST(@c AS VARCHAR(10)) + ' ' + CASE WHEN @c >= 50 THEN 'OK' ELSE 'FAIL' END;

PRINT '';
PRINT '[check-all] resumen de objetos del schema:';

DECLARE @tablas INT, @tablas50 INT, @procs INT, @vistas INT, @triggers INT, @funciones INT;

SELECT @tablas = COUNT(*) FROM sys.tables;

SELECT @tablas50 = COUNT(*)
FROM (
    SELECT t.object_id, SUM(p.rows) AS filas
    FROM sys.tables t
    JOIN sys.partitions p
      ON p.object_id = t.object_id AND p.index_id IN (0, 1)
    GROUP BY t.object_id
) x
WHERE x.filas >= 50;

SELECT @procs = COUNT(*) FROM sys.procedures;
SELECT @vistas = COUNT(*) FROM sys.views;
SELECT @triggers = COUNT(*) FROM sys.triggers;
SELECT @funciones = COUNT(*) FROM sys.objects WHERE type IN ('FN', 'IF', 'TF');

PRINT '[check-all] tablas: ' + CAST(@tablas AS VARCHAR(10));
PRINT '[check-all] tablas con seed >= 50 filas: ' + CAST(@tablas50 AS VARCHAR(10)) + '/' + CAST(@tablas AS VARCHAR(10));
PRINT '[check-all] procedimientos: ' + CAST(@procs AS VARCHAR(10));
PRINT '[check-all] vistas: ' + CAST(@vistas AS VARCHAR(10));
PRINT '[check-all] triggers: ' + CAST(@triggers AS VARCHAR(10));
PRINT '[check-all] funciones: ' + CAST(@funciones AS VARCHAR(10));
GO
