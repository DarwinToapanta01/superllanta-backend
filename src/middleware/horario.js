// Horario laboral: Lunes-Sábado 07:00 - 19:00 (UTC-5 Ecuador)
const verificarHorario = (req, res, next) => {
    // Los administradores no tienen restricción de horario
    if (req.usuario?.rol === 'administrador') return next()

    const ahora = new Date()
    // Convertir a hora Ecuador (UTC-5)
    const horaEcuador = new Date(ahora.getTime() - (5 * 60 * 60 * 1000))

    const dia = horaEcuador.getUTCDay()    // 0=Domingo, 1=Lunes ... 6=Sábado
    const hora = horaEcuador.getUTCHours() // 0-23
    const minutos = horaEcuador.getUTCMinutes()
    const horaDecimal = hora + minutos / 60

    // Domingo = 0, no se trabaja
    if (dia === 0) {
        return res.status(403).json({
            error: 'Acceso restringido',
            mensaje: 'El sistema no está disponible los domingos.',
            codigo: 'FUERA_HORARIO',
            horario: 'Lunes a Sábado de 07:00 a 19:00'
        })
    }

    // Fuera del horario 07:00 - 19:00
    if (horaDecimal < 7 || horaDecimal >= 19) {
        return res.status(403).json({
            error: 'Acceso restringido',
            mensaje: `El sistema está disponible de 07:00 a 19:00. Hora actual: ${hora.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`,
            codigo: 'FUERA_HORARIO',
            horario: 'Lunes a Sábado de 07:00 a 19:00'
        })
    }

    next()
}

module.exports = { verificarHorario }