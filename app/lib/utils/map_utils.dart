import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

class MapUtils {
  /// Opens Google Maps with a route from the current location (if available) to the destination address.
  static Future<void> launchMapsUrl(BuildContext context, String destinationAddress) async {
    String originParam = '';

    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Serviço de localização desabilitado.')),
        );
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Permissão de localização negada.')),
          );
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(
              'Permissão de localização negada permanentemente. Não podemos solicitar permissões.')),
        );
        return;
      }

      if (permission == LocationPermission.whileInUse ||
          permission == LocationPermission.always) {
        try {
          Position position = await Geolocator.getCurrentPosition(
            desiredAccuracy: LocationAccuracy.high,
          );
          originParam = '&saddr=${position.latitude},${position.longitude}';
        } catch (e) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Não foi possível obter a localização: $e')),
            );
          }
        }
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao obter localização: $e')),
      );
      return;
    }

    final String encodedDestination = Uri.encodeComponent(destinationAddress);
    String googleMapsUrl;

    if (originParam.isNotEmpty) {
      googleMapsUrl = 'https://www.google.com/maps/dir/?api=1&origin=${originParam.replaceFirst("&saddr=", "")}&destination=$encodedDestination&travelmode=driving';
    } else {
      googleMapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=$encodedDestination&travelmode=driving';
    }

    final Uri launchUri = Uri.parse(googleMapsUrl);

    if (await canLaunchUrl(launchUri)) {
      await launchUrl(launchUri, mode: LaunchMode.externalApplication);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Não foi possível abrir o app de mapas. Verifique se o Google Maps está instalado.')),
      );
      final Uri simplerLaunchUri = Uri.parse('https://maps.google.com/?q=$encodedDestination');
      if (await canLaunchUrl(simplerLaunchUri)) {
        await launchUrl(simplerLaunchUri, mode: LaunchMode.externalApplication);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Não foi possível abrir o app de mapas.')),
        );
      }
    }
  }
}