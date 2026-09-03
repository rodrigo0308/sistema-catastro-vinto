SISTEMA WEB DE GESTIÓN DE CATASTRO Y RECAUDACIÓN PARA EL CEMENTERIO MUNICIPAL DE VINTO  
Descripción del Proyecto

Este proyecto es un sistema web diseñado para automatizar y optimizar el proceso de gestión de catastro y recaudación del Cementerio Municipal de Vinto. Su objetivo principal es resolver la ineficiencia de los procedimientos manuales actuales (como la dependencia de libros físicos), incrementando la eficiencia tributaria y mitigando el riesgo operativo de realizar exhumaciones accidentales.

Arquitectura

El sistema está diseñado bajo una arquitectura de "Monolito Modular PWA-Ready". Se divide estratégicamente en tres capas para garantizar seguridad y rendimiento:  

Capa de Datos Espaciales y Tributarios: Separa lógicamente las geometrías espaciales de la lógica transaccional tributaria.  
Capa de Backend: Centraliza la lógica de negocio, cálculos automatizados y protección de rutas.  
Capa Frontend (PWA): Interfaz web progresiva con soporte para funcionamiento sin conexión a internet (offline) en zonas de campo. 

Stack Tecnológico

Para asegurar la factibilidad técnica operativa en los servidores de la institución, el proyecto utiliza exclusivamente tecnologías de código abierto (Open Source):

Frontend: Angular (v.17+).  
Backend: NestJS (v.10+).  
Base de Datos: PostgreSQL (v.16) equipado con la extensión espacial PostGIS (v.3+).
