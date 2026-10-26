import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// ignore: depend_on_referenced_packages
import 'package:flutter_web_plugins/url_strategy.dart' show usePathUrlStrategy;
import 'package:sentry_flutter/sentry_flutter.dart';
import 'core/theme/aera_theme.dart';
import 'core/router/app_router.dart';
import 'core/config/app_config.dart';
import 'core/network/sentry_scrub.dart';
import 'features/portal/portal_launch_fragment.dart';

Future<void> main() async {
  // Must run before anything touches the router / URL: portal links carry
  // their one-time token in the URL fragment, which the router discards.
  captureLaunchFragment();
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

  // Initialize Sentry if DSN is provided
  final sentryDsn = const String.fromEnvironment(
    'SENTRY_DSN',
    defaultValue: '',
  );
  if (sentryDsn.isNotEmpty) {
    await SentryFlutter.init((options) {
      options.dsn = sentryDsn;
      options.environment = const String.fromEnvironment(
        'ENVIRONMENT',
        defaultValue: 'development',
      );
      options.release = const String.fromEnvironment(
        'SENTRY_RELEASE',
        defaultValue: 'aera@1.0.0',
      );
      options.tracesSampleRate = AppConfig.tracesSampleRate;
      // ignore: experimental_member_use
      options.profilesSampleRate = AppConfig.tracesSampleRate;

      // Aera holds customer PII, so opt out of everything sensitive
      options.enableUserInteractionTracing = false;
      options.enableWatchdogTerminationTracking = true;
      options.enableAppHangTracking = true;
      options.attachScreenshot = false;
      // ignore: experimental_member_use
      options.attachViewHierarchy = false;

      // Portal magic-link tokens travel in the URL fragment (#t=...);
      // strip fragments from event request URLs and breadcrumbs so a
      // single-use token can never leak into a crash report.
      options.beforeSend = (event, hint) => scrubSentryEvent(event);
      options.beforeBreadcrumb = (breadcrumb, hint) =>
          breadcrumb == null ? null : scrubSentryBreadcrumb(breadcrumb);
    });
  }

  const app = ProviderScope(child: AeraApp());
  runApp(app);
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
