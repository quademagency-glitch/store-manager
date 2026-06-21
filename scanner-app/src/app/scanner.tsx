import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Location from 'expo-location';
import { useAppTheme } from '../lib/theme-context';
import type { AppTheme } from '../lib/theme';
import { ThemeToggleButton } from '../components/theme-toggle-button';
import { createEventSource, pushScan, removeToken, getMe, cancelScan, getAttendanceStatus, clockIn, clockOut, AuthExpiredError } from '../lib/api';

type ScanMode = 'idle' | 'list_view' | 'scanning_field' | 'stock_take_batch' | 'stock_take_summary';
type FieldType = 'serial_number' | 'pack_code' | 'product_code' | 'item_code';

export default function ScannerScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<ScanMode>('idle');
  const [activeField, setActiveField] = useState<FieldType | null>(null);
  const [payload, setPayload] = useState<Record<string, string>>({});
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [scannedBatch, setScannedBatch] = useState<string[]>([]);
  const [user, setUser] = useState<{name: string, role: string} | null>(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'failed'>('connecting');

  const sseRef = useRef<any>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  // Attendance state
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockedInSince, setClockedInSince] = useState<string | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [geofenceConfigured, setGeofenceConfigured] = useState(false);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [geofenceRadiusM, setGeofenceRadiusM] = useState(200);
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  const [timeWindow, setTimeWindow] = useState<{clock_in_start?: string, clock_in_end?: string, clock_out_start?: string, clock_out_end?: string} | null>(null);

  useEffect(() => {
    unmountedRef.current = false;

    const init = async () => {
      try {
        const userData = await getMe();
        if (!unmountedRef.current) setUser(userData);
      } catch (err: unknown) {
        if (unmountedRef.current) return;
        if (err instanceof AuthExpiredError) {
          Alert.alert('Session Expired', err.message);
          handleUnlink();
          return;
        }
        const msg = err instanceof Error ? err.message : 'Failed to connect to ERP';
        setInitError(msg);
      }
    };
    init();

    // Fetch attendance status
    fetchAttendance();
    requestLocationPermission();

    const connectSSE = async (attempt = 0) => {
      if (unmountedRef.current) return;

      try {
        const es = await createEventSource();
        sseRef.current = es;
        if (!unmountedRef.current) {
          setSseConnected(true);
          setSseStatus('connected');
        }

        es.addEventListener('message', (event: any) => {
          if (event.data === ':ping') return;
          try {
            const data = JSON.parse(event.data);
            if (data.command === 'scan_unit') {
              setTargetIndex(data.payload.index);
              setPayload({});
              setMode('list_view');
            }
          } catch {
            // Ignore malformed SSE messages
          }
        });

        es.addEventListener('error', (_err: any) => {
          if (unmountedRef.current) return;
          setSseConnected(false);
          es.close();
          sseRef.current = null;
          scheduleReconnect(attempt + 1);
        });

      } catch (e) {
        if (unmountedRef.current) return;
        if (e instanceof AuthExpiredError) {
          Alert.alert('Session Expired', (e as Error).message);
          handleUnlink();
          return;
        }
        scheduleReconnect(attempt + 1);
      }
    };

    const scheduleReconnect = (attempt: number) => {
      if (unmountedRef.current) return;
      const MAX_ATTEMPTS = 8;
      if (attempt >= MAX_ATTEMPTS) {
        setSseStatus('failed');
        setSseConnected(false);
        return;
      }
      const delayMs = Math.min(1000 * 2 ** attempt, 30000);
      setSseStatus('reconnecting');
      setSseConnected(false);
      reconnectTimerRef.current = setTimeout(() => connectSSE(attempt), delayMs);
    };

    connectSSE(0);

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, []);

  // ─── Attendance helpers ───

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setUserCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    } catch { /* GPS not available */ }
  };

  const haversineM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const fetchAttendance = async () => {
    try {
      const status = await getAttendanceStatus();
      setIsClockedIn(status.clocked_in);
      setClockedInSince(status.active_log?.clock_in || null);
      if (status.location) {
        setLocationName(status.location.name);
        setGeofenceRadiusM(status.location.geofence_radius_m || 200);
        // Store time window info
        setTimeWindow({
          clock_in_start: status.location.clock_in_start?.slice(0, 5),
          clock_in_end: status.location.clock_in_end?.slice(0, 5),
          clock_out_start: status.location.clock_out_start?.slice(0, 5),
          clock_out_end: status.location.clock_out_end?.slice(0, 5),
        });
        if (status.location.latitude && status.location.longitude) {
          setGeofenceConfigured(true);
          if (userCoords) {
            const d = Math.round(haversineM(userCoords.lat, userCoords.lng, status.location.latitude, status.location.longitude));
            setDistanceM(d);
          }
        }
      }
    } catch { /* ignore */ }
  };

  // Recompute distance when coords change
  useEffect(() => {
    if (userCoords && geofenceConfigured) {
      fetchAttendance();
    }
  }, [userCoords]);

  const isWithinGeofence = !geofenceConfigured || (distanceM !== null && distanceM <= geofenceRadiusM);

  const isWithinTimeWindow = (() => {
    if (!timeWindow) return true;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const action = isClockedIn ? 'clock_out' : 'clock_in';
    const start = timeWindow[`${action}_start` as keyof typeof timeWindow];
    const end = timeWindow[`${action}_end` as keyof typeof timeWindow];
    if (!start || !end) return true;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return currentMinutes >= sh * 60 + sm && currentMinutes <= eh * 60 + em;
  })();

  const getTimeWindowLabel = () => {
    if (!timeWindow) return null;
    const action = isClockedIn ? 'clock_out' : 'clock_in';
    const start = timeWindow[`${action}_start` as keyof typeof timeWindow];
    const end = timeWindow[`${action}_end` as keyof typeof timeWindow];
    if (!start || !end) return null;
    return `${isClockedIn ? 'Clock out' : 'Clock in'}: ${start} – ${end}`;
  };

  const handleClockIn = async () => {
    setAttendanceLoading(true);
    try {
      // Refresh GPS
      let lat = userCoords?.lat;
      let lng = userCoords?.lng;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
        setUserCoords({ lat, lng });
      } catch { /* use cached */ }

      await clockIn(lat, lng);
      setIsClockedIn(true);
      setClockedInSince(new Date().toISOString());
      Alert.alert('Clocked In ✅', 'You are now clocked in.');
      fetchAttendance();
    } catch (e: any) {
      if (e instanceof AuthExpiredError) {
        Alert.alert('Session Expired', e.message);
        handleUnlink();
        return;
      }
      Alert.alert('Clock In Failed', e.message || 'Could not clock in.');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleClockOut = async () => {
    setAttendanceLoading(true);
    try {
      let lat = userCoords?.lat;
      let lng = userCoords?.lng;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
        setUserCoords({ lat, lng });
      } catch { /* use cached */ }

      await clockOut(lat, lng);
      setIsClockedIn(false);
      setClockedInSince(null);
      Alert.alert('Clocked Out 👋', 'You have been clocked out.');
      fetchAttendance();
    } catch (e: any) {
      if (e instanceof AuthExpiredError) {
        Alert.alert('Session Expired', e.message);
        handleUnlink();
        return;
      }
      Alert.alert('Clock Out Failed', e.message || 'Could not clock out.');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const formatTimeSince = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleUnlink = async () => {
    unmountedRef.current = true;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    await removeToken();
    router.replace('/');
  };

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (mode === 'stock_take_batch') {
      if (scannedBatch.includes(data)) {
        Alert.alert('Duplicate', 'This code has already been scanned.');
      } else {
        setScannedBatch(prev => [...prev, data]);
      }
      return;
    }

    if (mode !== 'scanning_field' || !activeField) return;

    const alreadyScannedField = Object.keys(payload).find(key => payload[key] === data && key !== activeField);
    if (alreadyScannedField) {
      const fieldLabel = alreadyScannedField.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      Alert.alert('Duplicate Scan', `This barcode has already been scanned for ${fieldLabel}. Please scan a different code.`);
      return;
    }

    setPayload(prev => ({
      ...prev,
      [activeField]: data
    }));
    
    setMode('list_view');
    setActiveField(null);
  };

  const openCameraForField = (field: FieldType) => {
    setActiveField(field);
    setMode('scanning_field');
  };

  const handleSave = async () => {
    try {
      await pushScan(payload);
      setMode('idle');
      setTargetIndex(null);
      setPayload({});
      Alert.alert('Success', 'Scanned codes sent to ERP.');
    } catch (e) {
      if (e instanceof AuthExpiredError) {
        Alert.alert('Session Expired', (e as Error).message);
        handleUnlink();
        return;
      }
      const msg = e instanceof Error ? e.message : 'Failed to send scan to ERP';
      Alert.alert('Error', msg);
    }
  };

  const handleCancelList = async () => {
    if (targetIndex !== null) {
      try {
        await cancelScan();
      } catch (e) {
        console.error('Failed to notify ERP of cancellation', e);
      }
    }
    setMode('idle');
    setPayload({});
    setTargetIndex(null);
  };

  const handleCancelScan = () => {
    setMode('list_view');
    setActiveField(null);
  };

  const handleManualScanStart = () => {
    setTargetIndex(null);
    setPayload({});
    setMode('list_view');
  };

  const handleStartStockTake = () => {
    setScannedBatch([]);
    setMode('stock_take_batch');
  };

  const handleStockTakeSave = async () => {
    try {
      await pushScan({ command: 'batch_stock_take', pack_codes: scannedBatch });
      setMode('idle');
      setScannedBatch([]);
      Alert.alert('Success', 'Batch sent to ERP.');
    } catch (e) {
      if (e instanceof AuthExpiredError) {
        Alert.alert('Session Expired', (e as Error).message);
        handleUnlink();
        return;
      }
      const msg = e instanceof Error ? e.message : 'Failed to send batch to ERP';
      Alert.alert('Error', msg);
    }
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <SymbolView name="camera.fill" size={64} tintColor={theme.colors.mutedText} />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>We need your permission to scan barcodes and QR codes.</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (mode === 'idle') {
    return (
      <View style={styles.idleContainer}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.topBar}>
            <View style={styles.profilePill}>
              <View style={styles.avatarCircle}>
                <SymbolView name="person.fill" size={20} tintColor={initError ? theme.colors.error : theme.colors.accent} />
              </View>
              <View>
                {initError ? (
                  <>
                    <Text style={[styles.profileName, { color: theme.colors.error }]}>Connection Error</Text>
                    <Text style={[styles.profileRole, { color: theme.colors.error }]}>Tap Disconnect to relink</Text>
                  </>
                ) : user ? (
                  <>
                    <Text style={styles.profileName}>{user.name}</Text>
                    <Text style={[styles.profileRole, {
                      color: sseStatus === 'connected' ? theme.colors.success
                        : sseStatus === 'failed' ? theme.colors.error
                        : theme.colors.warning,
                    }]}>
                      {sseStatus === 'connected' ? `● ${user.role}`
                        : sseStatus === 'reconnecting' ? `↻ Reconnecting…`
                        : sseStatus === 'failed' ? `✕ Disconnected`
                        : `○ ${user.role}`}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.profileName}>Connecting…</Text>
                )}
              </View>
            </View>
            <ThemeToggleButton />
          </View>

          <View style={styles.idleCenter}>
            <View style={styles.actionButtonGroup}>
              {/* Attendance Button */}
              <View style={[styles.glowRing, { borderColor: isClockedIn ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', backgroundColor: isClockedIn ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)' }]}>
                <TouchableOpacity 
                  style={[
                    styles.hugeScanButton, 
                    { backgroundColor: isClockedIn ? theme.colors.error : theme.colors.success },
                    ((geofenceConfigured && !isWithinGeofence) || !isWithinTimeWindow) && { opacity: 0.5 }
                  ]} 
                  onPress={isClockedIn ? handleClockOut : handleClockIn}
                  activeOpacity={0.8}
                  disabled={attendanceLoading || (geofenceConfigured && !isWithinGeofence) || !isWithinTimeWindow}
                >
                  {attendanceLoading ? (
                    <ActivityIndicator size="large" color="#fff" />
                  ) : (
                    <>
                      <SymbolView 
                        name={isClockedIn ? "clock.badge.xmark" : "clock.badge.checkmark"} 
                        size={32} 
                        tintColor="#fff" 
                      />
                      <Text style={styles.hugeScanButtonText}>
                        {isClockedIn ? 'CLOCK OUT' : 'CLOCK IN'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Attendance Info */}
              {isClockedIn && clockedInSince && (
                <View style={styles.attendanceInfoPill}>
                  <View style={styles.clockPulseDot} />
                  <Text style={styles.attendanceInfoText}>
                    Working since {formatTimeSince(clockedInSince)}
                    {locationName ? ` at ${locationName}` : ''}
                  </Text>
                </View>
              )}

              {geofenceConfigured && distanceM !== null && (
                <View style={[
                  styles.geofencePill,
                  isWithinGeofence ? styles.geofencePillOk : styles.geofencePillFar
                ]}>
                  <SymbolView 
                    name={isWithinGeofence ? "location.fill" : "location.slash.fill"}
                    size={14}
                    tintColor={isWithinGeofence ? theme.colors.success : theme.colors.error}
                  />
                  <Text style={[
                    styles.geofencePillText,
                    { color: isWithinGeofence ? theme.colors.success : theme.colors.error }
                  ]}>
                    {distanceM}m away · {isWithinGeofence ? 'In range' : `Need ≤${geofenceRadiusM}m`}
                  </Text>
                </View>
              )}

              {/* Time Window Info */}
              {getTimeWindowLabel() && (
                <View style={[
                  styles.geofencePill,
                  isWithinTimeWindow ? styles.geofencePillOk : styles.geofencePillFar
                ]}>
                  <SymbolView 
                    name={isWithinTimeWindow ? "clock.fill" : "clock.badge.exclamationmark.fill"}
                    size={14}
                    tintColor={isWithinTimeWindow ? theme.colors.success : theme.colors.warning}
                  />
                  <Text style={[
                    styles.geofencePillText,
                    { color: isWithinTimeWindow ? theme.colors.success : theme.colors.warning }
                  ]}>
                    {getTimeWindowLabel()}{!isWithinTimeWindow ? ' (outside hours)' : ''}
                  </Text>
                </View>
              )}

              {/* Scan Buttons */}
              <View style={styles.glowRing}>
                <TouchableOpacity 
                  style={styles.hugeScanButton} 
                  onPress={handleManualScanStart}
                  activeOpacity={0.8}
                >
                  <SymbolView name="qrcode.viewfinder" size={32} tintColor="#fff" />
                  <Text style={styles.hugeScanButtonText}>START SCAN</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.glowRing, { borderColor: 'rgba(16, 185, 129, 0.15)', backgroundColor: 'rgba(16, 185, 129, 0.05)' }]}>
                <TouchableOpacity 
                  style={[styles.hugeScanButton, { backgroundColor: theme.colors.success }]} 
                  onPress={handleStartStockTake}
                  activeOpacity={0.8}
                >
                  <SymbolView name="shippingbox" size={32} tintColor="#fff" />
                  <Text style={styles.hugeScanButtonText}>STOCK TAKE</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.idleSubtitle}>
              Tap "Start Scan" for manual entry, or "Stock Take" for batch scanning.
            </Text>
          </View>

          <TouchableOpacity onPress={handleUnlink} style={styles.logoutButton}>
            <SymbolView name="rectangle.portrait.and.arrow.right" size={20} tintColor={theme.colors.error} />
            <Text style={styles.logoutButtonText}>Disconnect</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  if (mode === 'list_view') {
    const fields: { key: FieldType, label: string, required: boolean }[] = [
      { key: 'serial_number', label: 'Serial Number', required: true },
      { key: 'pack_code', label: 'Pack Code', required: true },
      { key: 'product_code', label: 'Product Code', required: true },
      { key: 'item_code', label: 'Item Code', required: false },
    ];

    const isAllRequiredScanned = fields
      .filter(f => f.required)
      .every(f => !!payload[f.key]);

    return (
      <View style={styles.listContainer}>
        <SafeAreaView style={styles.safeAreaList}>
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>
              {targetIndex !== null ? `Scanning Unit #${targetIndex + 1}` : 'Manual Entry'}
            </Text>
            <Text style={styles.listHeaderSubtitle}>Tap a field to scan its barcode</Text>
          </View>

          <ScrollView style={styles.listContent} contentContainerStyle={styles.listContentContainer}>
            {fields.map((field) => {
              const isScanned = !!payload[field.key];
              return (
                <TouchableOpacity 
                  key={field.key} 
                  style={[
                    styles.fieldCard, 
                    isScanned && styles.fieldCardScanned
                  ]}
                  onPress={() => openCameraForField(field.key)}
                  activeOpacity={0.7}
                >
                  <View style={styles.fieldInfo}>
                    <Text style={styles.fieldLabel}>
                      {field.label} {field.required ? '*' : ''}
                    </Text>
                    <Text style={[
                      styles.fieldValue,
                      !isScanned && styles.fieldValueEmpty
                    ]}>
                      {isScanned ? payload[field.key] : 'Tap to scan barcode...'}
                    </Text>
                  </View>
                  <View style={styles.fieldAction}>
                    {isScanned ? (
                      <View style={styles.successIconWrapper}>
                        <SymbolView name="checkmark" size={16} tintColor={theme.colors.success} />
                      </View>
                    ) : (
                      <SymbolView name="barcode.viewfinder" size={28} tintColor={theme.colors.accent} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.listFooter}>
            <TouchableOpacity style={styles.cancelListButton} onPress={handleCancelList}>
              <Text style={styles.cancelListButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.saveButton, !isAllRequiredScanned && styles.saveButtonDisabled]} 
              onPress={handleSave}
              disabled={!isAllRequiredScanned}
            >
              <Text style={styles.saveButtonText}>Save & Send</Text>
              <SymbolView name="paperplane.fill" size={18} tintColor={!isAllRequiredScanned ? "rgba(255,255,255,0.4)" : "#fff"} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (mode === 'stock_take_summary') {
    return (
      <View style={styles.listContainer}>
        <SafeAreaView style={styles.safeAreaList}>
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>Stock Take Summary</Text>
            <Text style={styles.listHeaderSubtitle}>
              {scannedBatch.length} pack codes scanned.
            </Text>
          </View>

          <ScrollView style={styles.listContent} contentContainerStyle={styles.listContentContainer}>
            {scannedBatch.length === 0 ? (
              <Text style={{ textAlign: 'center', color: theme.colors.mutedText, marginTop: 40 }}>
                No pack codes were scanned.
              </Text>
            ) : (
              scannedBatch.map((code, index) => (
                <View key={`${code}-${index}`} style={[styles.fieldCard, styles.fieldCardScanned]}>
                  <View style={styles.fieldInfo}>
                    <Text style={styles.fieldLabel}>Pack Code {index + 1}</Text>
                    <Text style={styles.fieldValue}>{code}</Text>
                  </View>
                  <View style={styles.fieldAction}>
                    <View style={styles.successIconWrapper}>
                      <SymbolView name="checkmark" size={16} tintColor={theme.colors.success} />
                    </View>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.listFooter}>
            <TouchableOpacity style={styles.cancelListButton} onPress={() => {
              setScannedBatch([]);
              setMode('idle');
            }}>
              <Text style={styles.cancelListButtonText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.saveButton, scannedBatch.length === 0 && styles.saveButtonDisabled]} 
              onPress={handleStockTakeSave}
              disabled={scannedBatch.length === 0}
            >
              <Text style={styles.saveButtonText}>Save & Send ({scannedBatch.length})</Text>
              <SymbolView name="paperplane.fill" size={18} tintColor={scannedBatch.length === 0 ? "rgba(255,255,255,0.4)" : "#fff"} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // mode === 'scanning_field' || mode === 'stock_take_batch'
  const activeFieldLabel = {
    'serial_number': 'Serial Number',
    'pack_code': 'Pack Code',
    'product_code': 'Product Code',
    'item_code': 'Item Code'
  }[activeField as string] || 'Barcode';

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        enableTorch={torchEnabled}
        barcodeScannerSettings={{
          barcodeTypes: [
            "qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "pdf417", "aztec", "datamatrix"
          ],
        }}
        onBarcodeScanned={handleBarCodeScanned}
      >
        <SafeAreaView style={styles.overlaySafeArea}>
          <View style={styles.overlayHeader}>
            {mode === 'stock_take_batch' ? (
              <View style={styles.statusPill}>
                <SymbolView name="shippingbox.fill" size={16} tintColor={theme.colors.success} />
                <Text style={styles.modeText}>Stock Take Mode: {scannedBatch.length} Scanned</Text>
              </View>
            ) : (
              <>
                <View style={styles.statusPill}>
                  <SymbolView name="viewfinder" size={16} tintColor={theme.colors.success} />
                  <Text style={styles.modeText}>Scanning {activeFieldLabel}</Text>
                </View>
                <Text style={styles.targetText}>
                  {targetIndex !== null ? `Unit #${targetIndex + 1}` : 'Manual Scan'}
                </Text>
              </>
            )}
          </View>

          <View style={styles.scanBoxWrapper}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          
          <View style={styles.overlayFooter}>
            <View style={styles.glassSheet}>
              <TouchableOpacity 
                style={[styles.torchButton, torchEnabled && styles.torchButtonActive]} 
                onPress={() => setTorchEnabled(!torchEnabled)}
              >
                <SymbolView 
                  name={torchEnabled ? "flashlight.on.fill" : "flashlight.off.fill"} 
                  size={24} 
                  tintColor={torchEnabled ? "#000" : "#fff"} 
                />
                <Text style={[styles.torchButtonText, torchEnabled && styles.torchButtonTextActive]}>
                  Flashlight
                </Text>
              </TouchableOpacity>

              {mode === 'stock_take_batch' ? (
                <TouchableOpacity 
                  style={[styles.cancelScanBtn, { backgroundColor: theme.colors.success }]} 
                  onPress={() => setMode('stock_take_summary')}
                >
                  <SymbolView name="checkmark" size={20} tintColor="#fff" />
                  <Text style={[styles.cancelScanBtnText, { color: '#fff' }]}>Done</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.cancelScanBtn} onPress={handleCancelScan}>
                  <SymbolView name="xmark" size={20} tintColor="#fff" />
                  <Text style={styles.cancelScanBtnText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primaryText,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  permissionText: {
    fontSize: 16,
    color: theme.colors.secondaryText,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  permissionButton: {
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.full,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Idle Mode Styles
  idleContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: theme.spacing.xl,
  },
  profilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.cardBackground,
    padding: theme.spacing.sm,
    paddingRight: theme.spacing.lg,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  profileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primaryText,
  },
  profileRole: {
    fontSize: 12,
    color: theme.colors.accent,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  idleCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: theme.spacing.lg,
  },
  actionButtonGroup: {
    width: '100%',
    gap: 14,
  },
  glowRing: {
    padding: 4,
    borderRadius: theme.radius.xl,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.1)',
  },
  hugeScanButton: {
    backgroundColor: theme.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 20,
    paddingHorizontal: 28,
    borderRadius: theme.radius.lg,
    shadowColor: theme.colors.accentHover,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  hugeScanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
  idleSubtitle: {
    fontSize: 15,
    color: theme.colors.mutedText,
    textAlign: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    gap: 8,
  },
  logoutButtonText: {
    color: theme.colors.error,
    fontSize: 16,
    fontWeight: 'bold',
  },

  // List View Styles
  safeAreaList: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listHeader: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
  },
  listHeaderTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: theme.colors.primaryText,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  listHeaderSubtitle: {
    fontSize: 15,
    color: theme.colors.secondaryText,
  },
  listContent: {
    flex: 1,
  },
  listContentContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: 12,
  },
  fieldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.cardBackground,
    padding: 20,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 2,
  },
  fieldCardScanned: {
    backgroundColor: theme.colors.successBackground,
    borderColor: theme.colors.success,
  },
  fieldInfo: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.mutedText,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fieldValue: {
    fontSize: 17,
    fontWeight: 'bold',
    color: theme.colors.primaryText,
  },
  fieldValueEmpty: {
    color: theme.colors.secondaryText,
    fontWeight: '500',
  },
  fieldAction: {
    marginLeft: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listFooter: {
    padding: theme.spacing.lg,
    flexDirection: 'row',
    gap: 16,
    backgroundColor: 'rgba(11, 15, 25, 0.9)',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  cancelListButton: {
    flex: 1,
    backgroundColor: theme.colors.cardBackground,
    padding: 16,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelListButtonText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    flex: 2,
    backgroundColor: theme.colors.accent,
    padding: 16,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Camera Overlay Styles
  overlaySafeArea: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'space-between',
  },
  overlayHeader: {
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: theme.radius.full,
    marginBottom: 8,
    gap: 8,
  },
  modeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  targetText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  scanBoxWrapper: {
    alignSelf: 'center',
    width: 280,
    height: 280,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: theme.colors.success,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 20,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 20,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 20,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 20,
  },
  overlayFooter: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  glassSheet: {
    backgroundColor: 'rgba(26, 31, 46, 0.8)',
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    gap: 16,
  },
  torchButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  torchButtonActive: {
    backgroundColor: '#fff',
  },
  torchButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  torchButtonTextActive: {
    color: '#000',
  },
  cancelScanBtn: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    padding: 16,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  cancelScanBtnText: {
    color: theme.colors.error,
    fontSize: 15,
    fontWeight: 'bold',
  },

  // ─── Attendance Styles ───
  attendanceInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardBackground,
    borderWidth: 1,
    borderColor: theme.colors.success,
    borderRadius: theme.radius.full,
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 8,
    alignSelf: 'center',
  },
  clockPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
  },
  attendanceInfoText: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '600',
  },
  geofencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: theme.radius.full,
    gap: 6,
    alignSelf: 'center',
  },
  geofencePillOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  geofencePillFar: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  geofencePillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  });
}
