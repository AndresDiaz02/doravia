import { Link } from "react-router-dom";

export default function Terminos() {
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
          Términos y Condiciones de Uso
        </h1>
        <p className="text-sm text-gray-500 mb-8">Última actualización: 2 de julio de 2026</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Descripción del servicio</h2>
            <p>
              <strong>Doravia</strong> es una plataforma de software como servicio (SaaS) que ofrece
              funcionalidades de ERP (Planificación de Recursos Empresariales) y POS (Punto de Venta),
              incluyendo facturación electrónica ante la DIAN, gestión de inventario, cartera, contabilidad
              y otras herramientas de gestión empresarial. El servicio es operado por{" "}
              <strong>Doravia SAS</strong> bajo las leyes de la República de Colombia.
            </p>
            <p className="mt-2">
              Al acceder o usar la plataforma, usted acepta quedar vinculado por estos Términos y Condiciones.
              Si no está de acuerdo con alguna de las condiciones aquí establecidas, le pedimos que no use
              el servicio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Planes y precios</h2>
            <p>
              Doravia ofrece diferentes planes de suscripción con distintas funcionalidades y límites de uso.
              El precio de cada plan se encuentra disponible en el panel de control de la plataforma y en
              el sitio web oficial.
            </p>
            <p className="mt-2">
              Doravia se reserva el derecho de modificar los precios de los planes con un aviso previo de
              al menos <strong>treinta (30) días calendario</strong>, enviado al correo electrónico
              registrado en la cuenta. Los cambios de precio no afectarán los períodos de suscripción ya
              pagados.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Obligaciones del usuario</h2>
            <p>Al usar Doravia, usted se compromete a:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>
                Proporcionar información veraz, completa y actualizada en su registro y en todos los
                documentos generados desde la plataforma.
              </li>
              <li>
                No compartir sus credenciales de acceso (usuario y contraseña) con terceros no autorizados.
                Usted es responsable de todas las actividades realizadas bajo su cuenta.
              </li>
              <li>
                No usar la plataforma para actividades ilegales, fraudulentas o contrarias a la normativa
                colombiana, incluyendo la evasión fiscal o la falsificación de documentos.
              </li>
              <li>
                Mantener su Registro Único Tributario (RUT) actualizado y vigente ante la DIAN.
              </li>
              <li>
                No intentar acceder a áreas restringidas de la plataforma ni realizar ingeniería inversa del
                software.
              </li>
              <li>
                Notificar de inmediato a Doravia si sospecha que su cuenta ha sido comprometida.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Obligaciones de Doravia</h2>
            <p>Doravia se compromete a:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>
                Mantener una <strong>disponibilidad objetivo del 99%</strong> mensual para los servicios
                principales de la plataforma, excluyendo mantenimientos programados anunciados con al menos
                24 horas de anticipación.
              </li>
              <li>
                Realizar <strong>copias de seguridad (backups) diarias</strong> de los datos almacenados
                en la plataforma.
              </li>
              <li>
                Brindar soporte técnico por correo electrónico a través de{" "}
                <a href="mailto:epsa2211@gmail.com" className="text-green-600 hover:underline">
                  epsa2211@gmail.com
                </a>{" "}
                en horario hábil (lunes a viernes de 8:00 a.m. a 6:00 p.m., hora Colombia).
              </li>
              <li>
                Notificar con antelación razonable cualquier cambio significativo en las funcionalidades
                del servicio.
              </li>
              <li>
                Proteger los datos personales de los usuarios conforme a lo descrito en nuestra{" "}
                <Link to="/privacidad" className="text-green-600 hover:underline">
                  Política de Privacidad
                </Link>
                .
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              5. Facturación electrónica y responsabilidad DIAN
            </h2>
            <p>
              Doravia facilita la generación y transmisión de facturas electrónicas ante la DIAN. Sin
              embargo, el usuario es el único responsable de:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>
                Habilitarse como facturador electrónico ante la DIAN y mantener dicha habilitación vigente.
              </li>
              <li>
                Gestionar y renovar sus resoluciones de facturación DIAN antes de su vencimiento o
                agotamiento del rango de consecutivos.
              </li>
              <li>
                La exactitud de los datos ingresados en cada factura (NIT del cliente, valores, impuestos,
                descripción de productos o servicios).
              </li>
              <li>
                Cumplir con las obligaciones tributarias derivadas de las facturas emitidas.
              </li>
            </ul>
            <p className="mt-3">
              <strong>Doravia no es responsable</strong> de rechazos de facturas por la DIAN causados por
              datos incorrectos, resoluciones vencidas, o incumplimientos del usuario con sus obligaciones
              tributarias.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              6. Limitación de responsabilidad
            </h2>
            <p>
              En la máxima medida permitida por la ley colombiana, Doravia no será responsable por:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>
                Daños indirectos, incidentales, especiales o consecuentes derivados del uso o la
                imposibilidad de uso del servicio.
              </li>
              <li>
                Pérdidas de negocio, ingresos o datos causadas por interrupciones del servicio fuera del
                control razonable de Doravia (fuerza mayor, fallas de terceros proveedores, etc.).
              </li>
              <li>
                Errores en facturas electrónicas causados por datos incorrectos suministrados por el usuario.
              </li>
              <li>
                Sanciones o multas impuestas por la DIAN por incumplimientos tributarios del usuario.
              </li>
            </ul>
            <p className="mt-3">
              La responsabilidad total de Doravia frente al usuario, por cualquier causa, no excederá el
              valor pagado por el usuario en los tres (3) meses anteriores al evento que origina la
              reclamación.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              7. Cancelación del servicio
            </h2>
            <p>
              El usuario puede cancelar su suscripción en cualquier momento desde el panel de control de
              la plataforma o comunicándose con soporte. La cancelación es efectiva al final del período
              de facturación en curso.
            </p>
            <p className="mt-2">
              <strong>No se realizan reembolsos</strong> de períodos de suscripción ya pagados, salvo que
              la ley colombiana lo exija expresamente.
            </p>
            <p className="mt-2">
              Tras la cancelación, los datos del usuario estarán disponibles para exportación durante un
              período de treinta (30) días calendario. Pasado este plazo, los datos podrán ser eliminados
              o anonimizados, salvo obligación legal de conservarlos.
            </p>
            <p className="mt-2">
              Doravia puede suspender o cancelar una cuenta por incumplimiento de estos Términos, con
              previo aviso de al menos 48 horas, salvo en casos de actividad fraudulenta o ilegal.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Propiedad intelectual</h2>
            <p>
              Todo el software, diseño, código fuente, marcas y contenido de la plataforma Doravia son
              propiedad exclusiva de Doravia SAS o sus licenciantes. El uso del servicio no le otorga
              ningún derecho de propiedad sobre el software.
            </p>
            <p className="mt-2">
              Los datos ingresados por el usuario (facturas, clientes, productos, etc.) son de su propiedad
              y Doravia los trata únicamente para prestar el servicio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              9. Modificaciones a los términos
            </h2>
            <p>
              Doravia puede modificar estos Términos y Condiciones en cualquier momento. Las modificaciones
              materiales serán notificadas con al menos <strong>quince (15) días de anticipación</strong>{" "}
              al correo registrado en la cuenta. El uso continuado del servicio tras la fecha de vigencia
              de los nuevos términos constituye la aceptación de los mismos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Ley aplicable y jurisdicción</h2>
            <p>
              Estos Términos y Condiciones se rigen por las leyes de la República de Colombia. Cualquier
              controversia derivada de los mismos será sometida a la jurisdicción ordinaria de los jueces
              y tribunales competentes de <strong>Bogotá D.C., Colombia</strong>, renunciando las partes
              a cualquier otro fuero que pudiera corresponderles.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">11. Contacto</h2>
            <p>
              Para cualquier consulta sobre estos Términos y Condiciones, puede comunicarse con nosotros a
              través del correo electrónico:{" "}
              <a href="mailto:epsa2211@gmail.com" className="text-green-600 hover:underline">
                epsa2211@gmail.com
              </a>
              .
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-gray-100 mt-12">
        <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col sm:flex-row justify-between gap-3 text-xs text-gray-400">
          <span>© 2026 Doravia SAS. Todos los derechos reservados.</span>
          <div className="flex gap-4">
            <Link to="/privacidad" className="hover:text-gray-600">Política de privacidad</Link>
            <Link to="/login" className="hover:text-gray-600">Iniciar sesión</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
