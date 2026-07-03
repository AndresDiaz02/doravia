import { Link } from "react-router-dom";

export default function Privacidad() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center justify-center h-9 w-9 rounded-lg bg-green-600 text-white font-bold text-lg"
          >
            D
          </Link>
          <span className="font-semibold text-gray-800">Doravia</span>
        </div>
      </header>

      {/* Contenido */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Política de Privacidad y Tratamiento de Datos Personales
        </h1>
        <p className="text-sm text-gray-500 mb-8">Última actualización: 2 de julio de 2026</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Responsable del tratamiento</h2>
            <p>
              <strong>Doravia SAS</strong> (NIT pendiente de asignar), con domicilio en la República de Colombia,
              es la empresa responsable del tratamiento de los datos personales que usted suministra a través
              de la plataforma Doravia ERP. Para cualquier consulta relacionada con el tratamiento de sus datos,
              puede comunicarse con nosotros al correo electrónico:{" "}
              <a href="mailto:epsa2211@gmail.com" className="text-green-600 hover:underline">
                epsa2211@gmail.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Marco legal</h2>
            <p>
              Esta política se rige por la <strong>Ley 1581 de 2012</strong> (Ley Estatutaria de Protección
              de Datos Personales — Habeas Data), el <strong>Decreto 1377 de 2013</strong>, el
              <strong> Decreto Único Reglamentario 1074 de 2015</strong> y demás normas complementarias
              vigentes en Colombia. Doravia actúa en calidad de <strong>Responsable del Tratamiento</strong>{" "}
              respecto de los datos personales de sus usuarios y clientes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Datos personales que recopilamos</h2>
            <p>Doravia recopila y trata las siguientes categorías de datos personales:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>
                <strong>Datos de identificación:</strong> nombre o razón social, número de identificación (CC,
                NIT, CE), dígito de verificación.
              </li>
              <li>
                <strong>Datos de contacto:</strong> dirección de correo electrónico, número de teléfono,
                dirección física.
              </li>
              <li>
                <strong>Datos de facturación y tributarios:</strong> NIT, régimen tributario, resoluciones
                DIAN, CUFE, información de facturas electrónicas.
              </li>
              <li>
                <strong>Datos de uso del sistema:</strong> registros de acceso, acciones realizadas en la
                plataforma, dirección IP, preferencias de configuración.
              </li>
              <li>
                <strong>Datos de pago:</strong> referencias de transacciones (no almacenamos datos completos
                de tarjetas de crédito; los pagos son procesados por Bold).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              4. Finalidades del tratamiento
            </h2>
            <p>Los datos personales son tratados para las siguientes finalidades:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Prestación del servicio de software ERP y POS como servicio (SaaS).</li>
              <li>Generación, envío y gestión de facturas electrónicas ante la DIAN.</li>
              <li>Gestión de la relación comercial: cobros, renovaciones, soporte técnico.</li>
              <li>Envío de notificaciones transaccionales relacionadas con el servicio.</li>
              <li>Cumplimiento de obligaciones legales y tributarias.</li>
              <li>Mejora continua de la plataforma mediante análisis de uso agregado.</li>
              <li>Prevención del fraude y seguridad de la plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              5. Transferencias a terceros
            </h2>
            <p>
              Doravia comparte datos personales únicamente con proveedores necesarios para la prestación del
              servicio, quienes actúan como <strong>Encargados del Tratamiento</strong>:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>
                <strong>Plemsi</strong> — proveedor tecnológico para la facturación electrónica y comunicación
                con la DIAN.
              </li>
              <li>
                <strong>Bold</strong> — procesador de pagos en línea. Los datos de pago se rigen por su
                propia política de privacidad.
              </li>
              <li>
                <strong>Railway</strong> — proveedor de alojamiento en la nube donde se ejecuta la plataforma.
              </li>
              <li>
                <strong>Resend</strong> — servicio de envío de correos electrónicos transaccionales.
              </li>
            </ul>
            <p className="mt-3">
              No vendemos, alquilamos ni comercializamos sus datos personales con terceros con fines
              publicitarios o de mercadeo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              6. Conservación de los datos
            </h2>
            <p>
              Los datos personales se conservarán durante el tiempo que dure la relación comercial con Doravia.
              Una vez terminada dicha relación, los datos se conservarán por un período adicional de{" "}
              <strong>cinco (5) años</strong>, en cumplimiento de las obligaciones tributarias y contables
              establecidas en la legislación colombiana (Estatuto Tributario y normas concordantes).
            </p>
            <p className="mt-2">
              Los datos de auditoría y registros de acceso se conservan por un período mínimo de dos (2) años.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Uso de cookies</h2>
            <p>
              Doravia utiliza cookies de sesión estrictamente necesarias para mantener su sesión activa dentro
              de la plataforma. Estas cookies no se utilizan para rastrear su comportamiento fuera de la
              plataforma ni para fines publicitarios. No se utilizan cookies de terceros con fines de
              seguimiento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              8. Derechos del titular
            </h2>
            <p>
              De conformidad con la Ley 1581 de 2012, usted como titular de datos personales tiene los
              siguientes derechos:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>
                <strong>Conocer</strong> los datos personales que Doravia trata sobre usted.
              </li>
              <li>
                <strong>Actualizar y rectificar</strong> sus datos cuando sean inexactos, incompletos o
                desactualizados.
              </li>
              <li>
                <strong>Suprimir</strong> sus datos cuando no sean necesarios para las finalidades del
                tratamiento, salvo obligación legal de conservarlos.
              </li>
              <li>
                <strong>Revocar la autorización</strong> para el tratamiento de sus datos, cuando no exista
                un deber legal o contractual que lo impida.
              </li>
              <li>
                <strong>Presentar quejas</strong> ante la Superintendencia de Industria y Comercio (SIC) por
                infracciones a la normativa de protección de datos.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              9. Cómo ejercer sus derechos
            </h2>
            <p>
              Para ejercer cualquiera de los derechos anteriores, el titular o su representante legal debe
              enviar una solicitud escrita al correo electrónico:{" "}
              <a href="mailto:epsa2211@gmail.com" className="text-green-600 hover:underline">
                epsa2211@gmail.com
              </a>
              , indicando:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Nombre completo e identificación del titular.</li>
              <li>Descripción clara de la solicitud.</li>
              <li>Documentos que acrediten la identidad o la representación, si aplica.</li>
            </ul>
            <p className="mt-2">
              Doravia dará respuesta a su solicitud dentro de los plazos legales establecidos (10 días hábiles
              para consultas, 15 días hábiles para reclamos, prorrogables conforme a la ley).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Seguridad</h2>
            <p>
              Doravia implementa medidas técnicas y organizativas para proteger sus datos personales contra
              acceso no autorizado, pérdida, alteración o divulgación, incluyendo cifrado de contraseñas,
              tokens de acceso con caducidad, y registro de auditoría de todas las acciones realizadas en
              la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              11. Cambios a esta política
            </h2>
            <p>
              Doravia puede actualizar esta política periódicamente. Cuando realicemos cambios materiales,
              se lo notificaremos por correo electrónico o mediante un aviso prominente en la plataforma.
              La fecha de la última actualización siempre se indicará al inicio de este documento.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-gray-100 mt-12">
        <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col sm:flex-row justify-between gap-3 text-xs text-gray-400">
          <span>© 2026 Doravia SAS. Todos los derechos reservados.</span>
          <div className="flex gap-4">
            <Link to="/terminos" className="hover:text-gray-600">Términos de uso</Link>
            <Link to="/login" className="hover:text-gray-600">Iniciar sesión</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
