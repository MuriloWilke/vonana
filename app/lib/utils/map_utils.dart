import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

class MapUtils {
  /// Opens Google Maps with a route from the current location (if available) to the destination address.
  static Future<void> launchMapsUrl(BuildContext context, String destinationAddress) async {
    final TargetPlatform platform = Theme.of(context).platform;

    void showSafeSnackBar(String message) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message)),
        );
      }
    }

    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      showSafeSnackBar('Serviço de localização desabilitado.');
      return;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        showSafeSnackBar('Permissão de localização negada.');
        return;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      showSafeSnackBar('Permissão negada permanentemente. Habilite nas configurações do app.');
      return;
    }

    Position? currentPosition;
    if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
      try {
        LocationSettings locationSettings;

        if (platform == TargetPlatform.android) {
          locationSettings = AndroidSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 100,
            forceLocationManager: true,
          );
        } else {
          locationSettings = const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 100,
          );
        }

        currentPosition = await Geolocator.getCurrentPosition(
          locationSettings: locationSettings,
        ).timeout(const Duration(seconds: 10));

      } catch (e) {
        showSafeSnackBar('Não foi possível obter a localização atual: $e');
      }
    }

    final String encodedDestination = Uri.encodeComponent(destinationAddress);
    Uri? mapsUri;

    if (currentPosition != null) {
      final origin = '${currentPosition.latitude},${currentPosition.longitude}';
      mapsUri = Uri.parse(
        'https://www.google.com/maps/dir/?api=1&origin=$origin&destination=$encodedDestination&travelmode=driving',
      );
    } else {
      mapsUri = Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=$encodedDestination',
      );
    }

    if (await canLaunchUrl(mapsUri)) {
      await launchUrl(mapsUri, mode: LaunchMode.externalApplication);
    } else {
      showSafeSnackBar('Não foi possível abrir o Google Maps.');
    }
  }
}