import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'core/theme/aera_theme.dart';
import 'core/router/app_router.dart';
import 'core/config/app_config.dart';
import 'core/observability/sentry_bootstrap.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );

  bootstrapWithSentry(() {
    runApp(const AeraApp());
  });
}

class AeraApp extends StatelessWidget {
  const AeraApp({super.key});

  @override
  Widget build(BuildContext context) {
    final app = ProviderScope(
      child: MaterialApp.router(
        title: 'Aera Field Operations',
        debugShowCheckedModeBanner: false,
        theme: AeraTheme.lightTheme,
        routerConfig: appRouter,
      ),
    );

    // Only wrap in SentryWidget when Sentry is enabled
    if (AppConfig.isSentryEnabled) {
      return SentryWidget(child: app);
    }
    return app;
  }
}
