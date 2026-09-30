export function gpsToPixel(latitude, longitude, config) {
    const x = ((longitude - config.lonLeft) / (config.lonRight - config.lonLeft)) * config.width;

    const y = ((config.latTop - latitude) / (config.latTop - config.latBottom)) * config.height;

    return { x, y };
}

export function pixelToGps(x, y, config) {
    const longitude = config.lonLeft + (x / config.width) * (config.lonRight - config.lonLeft);

    const latitude = config.latTop - (y / config.height) * (config.latTop - config.latBottom);

    return { latitude, longitude };
}

export function isInsideMap(latitude, longitude, config) {
    return (
        latitude <= config.latTop &&
        latitude >= config.latBottom &&
        longitude >= config.lonLeft &&
        longitude <= config.lonRight
    );
}
