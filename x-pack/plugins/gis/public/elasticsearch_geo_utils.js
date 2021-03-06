/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import _ from 'lodash';

export function hitsToGeoJson(hits, geoFieldName, geoFieldType) {
  const features = hits
    .filter(hit => {
      return _.has(hit, `_source[${geoFieldName}]`);
    })
    .map(hit => {
      const value = _.get(hit, `_source[${geoFieldName}]`);
      let geometry;
      if (geoFieldType === 'geo_point') {
        geometry = geoPointToGeometry(value);
      } else if (geoFieldType === 'geo_shape') {
        geometry = geoShapeToGeometry(value);
      } else {
        throw new Error(`Unsupported field type, expected: geo_shape or geo_point, you provided: ${geoFieldType}`);
      }

      const properties = {};
      for (const fieldName in hit._source) {
        if (hit._source.hasOwnProperty(fieldName)) {
          if (fieldName !== geoFieldName) {
            properties[fieldName] = hit._source[fieldName];
          }
        }
      }

      // hit.fields contains calculated values from docvalue_fields and script_fields
      for (const fieldName in hit.fields) {
        if (hit.fields.hasOwnProperty(fieldName)) {
          const val = hit.fields[fieldName];
          properties[fieldName] = Array.isArray(val) && val.length === 1 ? val[0] : val;
        }
      }

      return {
        type: 'Feature',
        geometry: geometry,
        properties: properties
      };
    });

  return {
    type: 'FeatureCollection',
    features: features
  };
}

export function geoPointToGeometry(value) {
  let lat;
  let lon;
  if (typeof value === 'string') {
    const commaSplit = value.split(',');
    if (commaSplit.length === 1) {
      // Geo-point expressed as a geohash.
      throw new Error(`Unable to convert to geojson, geohash not supported`);
    }
    // Geo-point expressed as a string with the format: "lat,lon".
    lat = parseFloat(commaSplit[0]);
    lon = parseFloat(commaSplit[1]);
  } else if (Array.isArray(value)) {
    // Geo-point expressed as an array with the format: [ lon, lat]
    lat = value[1];
    lon = value[0];
  } else if (value !== null && typeof value === 'object') {
    lat = value.lat;
    lon = value.lon;
  }

  return {
    type: 'Point',
    coordinates: [lon, lat]
  };
}


export function makeGeohashGridPolygon(geohashGridFeature) {
  const esBbox = geohashGridFeature.properties.geohash_meta.rectangle;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [esBbox[0][1], esBbox[0][0]],
        [esBbox[1][1], esBbox[1][0]],
        [esBbox[2][1], esBbox[2][0]],
        [esBbox[3][1], esBbox[3][0]],
        [esBbox[0][1], esBbox[0][0]],
      ]
    ]
  };
}

export function geoShapeToGeometry(value) {
  // TODO handle case where value is WKT and convert to geojson
  if (typeof value === "string") {
    throw new Error(`Unable to convert WKT to geojson, not supported`);
  }

  const geoJson = _.cloneDeep(value);

  // https://www.elastic.co/guide/en/elasticsearch/reference/current/geo-shape.html#input-structure
  // For some unknown compatibility nightmarish reason, Elasticsearch types are not capitalized the same as geojson types
  // For example: 'LineString' geojson type is 'linestring' in elasticsearch
  // Convert feature types to geojson spec values
  switch (geoJson.type) {
    case 'point':
      geoJson.type = 'Point';
      break;
    case 'linestring':
      geoJson.type = 'LineString';
      break;
    case 'polygon':
      geoJson.type = 'Polygon';
      break;
    case 'multipoint':
      geoJson.type = 'MultiPoint';
      break;
    case 'multilinestring':
      geoJson.type = 'MultiLineString';
      break;
    case 'geometrycollection':
      geoJson.type = 'GeometryCollection';
      break;
  }

  // TODO handle envelope and circle geometry types which exist in elasticsearch but not in geojson
  if (geoJson.type === 'envelope' || geoJson.type === 'circle') {
    throw new Error(`Unable to convert ${geoJson.type} geometry to geojson, not supported`);
  }

  return geoJson;
}

export function createExtentFilter(mapExtent, geoFieldName, geoFieldType) {
  // TODO this is not a complete implemenation. Need to handle other cases:
  // 1) bounds are all east of 180
  // 2) bounds are all west of -180
  const noWrapMapExtent = {
    minLon: mapExtent.minLon < -180 ? -180 : mapExtent.minLon,
    minLat: mapExtent.minLat < -90 ? -90 : mapExtent.minLat,
    maxLon: mapExtent.maxLon > 180 ? 180 : mapExtent.maxLon,
    maxLat: mapExtent.maxLat > 90 ? 90 : mapExtent.maxLat,
  };

  if (geoFieldType === 'geo_point') {
    return {
      geo_bounding_box: {
        [geoFieldName]: {
          top_left: {
            lat: noWrapMapExtent.maxLat,
            lon: noWrapMapExtent.minLon
          },
          bottom_right: {
            lat: noWrapMapExtent.minLat,
            lon: noWrapMapExtent.maxLon
          }
        }
      }
    };
  } else if (geoFieldType === 'geo_shape') {
    return {
      geo_shape: {
        [geoFieldName]: {
          shape: {
            type: 'envelope',
            coordinates: [
              [noWrapMapExtent.minLon, noWrapMapExtent.maxLat],
              [noWrapMapExtent.maxLon, noWrapMapExtent.minLat]
            ]
          },
          relation: 'INTERSECTS'
        }
      }
    };
  } else {
    throw new Error(`Unsupported field type, expected: geo_shape or geo_point, you provided: ${geoFieldType}`);
  }
}

/*
 * Convert map bounds to envelope
 * Bounds that cross the dateline are split into 2 envelopes
 */
export function convertMapExtentToEnvelope({ maxLat, maxLon, minLat, minLon }) {
  if (maxLon > 180 && minLon < -180) {
    return convertMapExtentToEnvelope({
      maxLat,
      maxLon: 180,
      minLat,
      minLon: -180,
    });
  }

  if (maxLon > 180) {
    // bounds cross datleine east to west, slit into 2 shapes
    const overlapWestOfDateLine = maxLon - 180;
    return [
      convertMapExtentToEnvelope({
        maxLat,
        maxLon: 180,
        minLat,
        minLon,
      }),
      convertMapExtentToEnvelope({
        maxLat,
        maxLon: -180 + overlapWestOfDateLine,
        minLat,
        minLon: -180,
      }),
    ];
  }

  if (minLon < -180) {
    // bounds cross datleine west to east, slit into 2 shapes
    const overlapEastOfDateLine = Math.abs(minLon) - 180;
    return [
      convertMapExtentToEnvelope({
        maxLat,
        maxLon: 180,
        minLat,
        minLon: 180 - overlapEastOfDateLine,
      }),
      convertMapExtentToEnvelope({
        maxLat,
        maxLon: maxLon,
        minLat,
        minLon: -180,
      }),
    ];
  }

  return {
    "type": "envelope",
    "coordinates": [
      [minLon, maxLat], [maxLon, minLat]
    ]
  };
}
