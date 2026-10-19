import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// ignore: depend_on_referenced_packages
import 'package:flutter_web_plugins/url_strategy.dart' show usePathUrlStrategy;
import 'package:sentry_flutter/sentry_flutter.dart';
import 'core/theme/aera_theme.dart';
import 'core/router/app_router.dart';
import 'core/config/app_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Phase 5: Use path URL strategy for web builds so customer-facing links
  // work correctly with static hosting (e.g., Cloudflare Pages) and SPA fallback.
  usePathUrlStrategy();

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );

  // Initialize Sentry following official pattern
  await SentryFlutter.init(
    (options) {
      options.dsn = const String.fromEnvironment(
        'SENTRY_DSN',
        defaultValue: '',
      );
      options.environment = const String.fromEnvironment(
        'ENVIRONMENT',
        defaultValue: 'development',
      );
      options.release = const String.fromEnvironment(
        'SENTRY_RELEASE',
        defaultValue: 'aera@1.0.0',
      );
      options.tracesSampleRate = const double.fromEnvironment(
        'SENTRY_TRACES_SAMPLE_RATE',
        defaultValue: 1.0,
      );
      options.profilesSampleRate = const double.fromEnvironment(
        'SENTRY_TRACES_SAMPLE_RATE',
        defaultValue: 1.0,
      );

      // Only initialize if DSN is provided
      if (options.dsn.isEmpty) {
        return;
      }

      // Aera holds customer PII, so opt out of everything sensitive
      options.enableUserInteractionTracing = false;
      options.enableWatchdogTerminationTracking = true;
      options.enableAppHangTracking = true;

      // Disable screenshots and view hierarchy attachments (they can capture customer data)
      options.attachScreenshot = false;
      // attachViewHierarchy is marked @experimental in sentry_flutter. We keep
      // the explicit opt-out on purpose: the view hierarchy can capture
      // customer data, and it must stay off even if the default changes.
      // ignore: experimental_member_use
      options.attachViewHierarchy = false;

      // Filter expected errors - only report 5xx and unhandled exceptions
      options.beforeSend = (event, hint) {
        final error = hint?.exception;
        if (error != null && error.toString().contains('4')) {
          // Ignore 4xx client errors
          return null;
        }
        return event;
      };
    },
    appRunner: () {
      // The ProviderScope lives above the app so the router (which reads the
      // auth state) and every screen share one provider container.
      const app = ProviderScope(child: AeraApp());
      runApp(app);
    },
  );
}

class AeraApp extends ConsumerWidget {
  const AeraApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Aera Field Operations',
      debugShowCheckedModeBanner: false,
      theme: AeraTheme.lightTheme,
      routerConfig: router,
    );
  }
}
