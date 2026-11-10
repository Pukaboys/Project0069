import ExpoModulesCore
import ARKit
import SceneKit
import AVFoundation
import UIKit
import simd

private enum ScanStore {
  static var directory: URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Scans", isDirectory: true)
  }
  static func file(_ id: String, _ ext: String) throws -> URL {
    guard UUID(uuidString: id) != nil else { throw NSError(domain: "Scanner", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid scan identifier."]) }
    return directory.appendingPathComponent(id).appendingPathExtension(ext)
  }
  static func list() throws -> [[String: Any]] {
    guard FileManager.default.fileExists(atPath: directory.path) else { return [] }
    return try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "json" }
      .compactMap { url in
        guard let data = try? Data(contentsOf: url), let record = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return record
      }.sorted { ($0["date"] as? String ?? "") > ($1["date"] as? String ?? "") }
  }
}

public class CountertopScannerModule: Module {
  private var active = false
  public func definition() -> ModuleDefinition {
    Name("CountertopScanner")
    Function("isSupported") { ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) }
    AsyncFunction("listScans") { () throws -> [[String: Any]] in try ScanStore.list() }
    AsyncFunction("scan") { (width: Double, depth: Double, height: Double, promise: Promise) in
      guard !self.active else { promise.reject("BUSY", "A scan is already open."); return }
      guard ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) else { promise.reject("UNSUPPORTED", "A LiDAR-equipped iPhone is required."); return }
      guard width.isFinite, depth.isFinite, height.isFinite, (0.2...10).contains(width), (0.2...10).contains(depth), (0.02...1).contains(height) else { promise.reject("DIMENSIONS", "Invalid capture region."); return }
      self.active = true
      AVCaptureDevice.requestAccess(for: .video) { granted in
        DispatchQueue.main.async {
          guard granted else { self.active = false; promise.reject("CAMERA", "Allow camera access in iPhone Settings to scan."); return }
          guard let parent = self.appContext?.utilities?.currentViewController() else { self.active = false; promise.reject("PRESENTATION", "No screen is available."); return }
          let scanner = ScanController(width: Float(width), depth: Float(depth), height: Float(height)) { result in
            self.active = false
            switch result {
            case .success(let record): promise.resolve(record)
            case .failure(let error): promise.reject("SCAN", error.localizedDescription)
            }
          }
          scanner.modalPresentationStyle = .fullScreen
          parent.present(scanner, animated: true)
        }
      }
    }.runOnQueue(.main)
    AsyncFunction("share") { (id: String) throws in
      let url = try ScanStore.file(id, "obj")
      guard FileManager.default.fileExists(atPath: url.path), let parent = self.appContext?.utilities?.currentViewController() else { throw NSError(domain: "Scanner", code: 2, userInfo: [NSLocalizedDescriptionKey: "Scan file is unavailable."]) }
      let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
      sheet.popoverPresentationController?.sourceView = parent.view
      parent.present(sheet, animated: true)
    }.runOnQueue(.main)
    AsyncFunction("preview") { (id: String) throws in
      let url = try ScanStore.file(id, "obj")
      let scene = try SCNScene(url: url, options: nil)
      guard let parent = self.appContext?.utilities?.currentViewController() else { return }
      let controller = UIViewController()
      let view = SCNView()
      view.scene = scene
      view.backgroundColor = UIColor(red: 0.04, green: 0.08, blue: 0.10, alpha: 1)
      view.allowsCameraControl = true
      view.autoenablesDefaultLighting = true
      scene.rootNode.enumerateChildNodes { node, _ in
        node.geometry?.firstMaterial?.diffuse.contents = UIColor.systemMint
        node.geometry?.firstMaterial?.lightingModel = .constant
        node.geometry?.firstMaterial?.isDoubleSided = true
      }
      controller.view = view
      controller.title = "Drag to rotate · pinch to zoom"
      let navigation = UINavigationController(rootViewController: controller)
      parent.present(navigation, animated: true)
    }.runOnQueue(.main)
  }
}

private final class ScanController: UIViewController, ARSessionDelegate {
  private let ar = ARSCNView()
  private let status = UILabel()
  private let finish = UIButton(type: .system)
  private let width: Float
  private let depth: Float
  private let height: Float
  private var origin: simd_float4x4?
  private var meshNodes: [UUID: SCNNode] = [:]
  private let region = SCNNode()
  private var ended = false
  private var trackingReady = false
  private var previousIdleTimerDisabled = false
  private let completion: (Result<[String: Any]?, Error>) -> Void

  init(width: Float, depth: Float, height: Float, completion: @escaping (Result<[String: Any]?, Error>) -> Void) {
    self.width = width; self.depth = depth; self.height = height; self.completion = completion
    super.init(nibName: nil, bundle: nil)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  override func viewDidLoad() {
    super.viewDidLoad()
    previousIdleTimerDisabled = UIApplication.shared.isIdleTimerDisabled
    UIApplication.shared.isIdleTimerDisabled = true
    view.backgroundColor = .black
    ar.frame = view.bounds
    ar.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    ar.scene = SCNScene()
    ar.session.delegate = self
    ar.session.delegateQueue = .main
    view.addSubview(ar)
    ar.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(selectSurface(_:))))
    status.text = "Move slowly, then tap the CENTER of the countertop."
    status.textColor = .white; status.numberOfLines = 0; status.textAlignment = .center
    let cancel = button("Cancel", action: #selector(cancelScan))
    finish.setTitle("Save 3D object", for: .normal)
    finish.addTarget(self, action: #selector(save), for: .touchUpInside)
    finish.isEnabled = false
    let reset = button("Reset", action: #selector(resetScan))
    let row = UIStackView(arrangedSubviews: [cancel, reset, finish])
    row.axis = .horizontal; row.distribution = .fillEqually; row.spacing = 10
    let hud = UIStackView(arrangedSubviews: [status, row])
    hud.axis = .vertical; hud.spacing = 14; hud.isLayoutMarginsRelativeArrangement = true
    hud.layoutMargins = UIEdgeInsets(top: 16, left: 12, bottom: 16, right: 12)
    hud.backgroundColor = UIColor.black.withAlphaComponent(0.8)
    hud.layer.cornerRadius = 18; hud.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(hud)
    NSLayoutConstraint.activate([
      hud.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      hud.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      hud.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
      row.heightAnchor.constraint(equalToConstant: 48)
    ])
    NotificationCenter.default.addObserver(self, selector: #selector(backgrounded), name: UIApplication.didEnterBackgroundNotification, object: nil)
    runSession()
  }
  private func button(_ title: String, action: Selector) -> UIButton {
    let button = UIButton(type: .system); button.setTitle(title, for: .normal)
    button.addTarget(self, action: action, for: .touchUpInside); return button
  }
  private func runSession() {
    let config = ARWorldTrackingConfiguration()
    config.sceneReconstruction = .mesh
    config.planeDetection = [.horizontal]
    ar.session.run(config, options: [.resetTracking, .removeExistingAnchors])
  }
  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    ar.session.pause()
    UIApplication.shared.isIdleTimerDisabled = previousIdleTimerDisabled
  }
  deinit { NotificationCenter.default.removeObserver(self) }
  @objc private func backgrounded() { if !ended { close(.success(nil)) } }
  @objc private func cancelScan() { close(.success(nil)) }
  @objc private func resetScan() {
    origin = nil; trackingReady = false; finish.isEnabled = false
    meshNodes.values.forEach { $0.removeFromParentNode() }; meshNodes.removeAll()
    region.removeFromParentNode(); status.text = "Move slowly, then tap the CENTER of the countertop."
    runSession()
  }
  @objc private func selectSurface(_ recognizer: UITapGestureRecognizer) {
    guard origin == nil, trackingReady else { return }
    guard
      let query = ar.raycastQuery(from: recognizer.location(in: ar), allowing: .estimatedPlane, alignment: .horizontal),
      let hit = ar.session.raycast(query).first,
      let camera = ar.session.currentFrame?.camera else {
      status.text = "Surface not found. Move slowly and tap the countertop again."
      return
    }
    // Capture box follows the camera's horizontal heading at selection time.
    let forward = camera.transform.columns.2
    let yaw = atan2(forward.x, forward.z)
    let c = cos(yaw), s = sin(yaw)
    var transform = matrix_identity_float4x4
    transform.columns.0 = SIMD4(c, 0, -s, 0)
    transform.columns.2 = SIMD4(s, 0, c, 0)
    transform.columns.3 = hit.worldTransform.columns.3
    origin = transform
    let box = SCNBox(width: CGFloat(width), height: CGFloat(height), length: CGFloat(depth), chamferRadius: 0)
    box.firstMaterial?.diffuse.contents = UIColor.systemYellow
    box.firstMaterial?.fillMode = .lines
    region.geometry = box; region.simdTransform = transform
    ar.scene.rootNode.addChildNode(region)
    refreshMeshes()
  }
  private func local(_ point: SIMD3<Float>) -> SIMD3<Float> {
    guard let origin else { return point }
    let p = simd_inverse(origin) * SIMD4(point.x, point.y, point.z, 1)
    return SIMD3(p.x, p.y, p.z)
  }
  private func inside(_ p: SIMD3<Float>) -> Bool {
    abs(p.x) <= width / 2 && abs(p.z) <= depth / 2 && abs(p.y) <= height / 2
  }
  private func triangles(_ anchor: ARMeshAnchor) -> [SIMD3<Float>] {
    guard origin != nil else { return [] }
    let geometry = anchor.geometry
    var points: [SIMD3<Float>] = []
    for face in 0..<geometry.faces.count {
      var triangle: [SIMD3<Float>] = []
      for corner in 0..<3 {
        let offset = (face * 3 + corner) * geometry.faces.bytesPerIndex
        let buffer = geometry.faces.buffer.contents().advanced(by: offset)
        let index = geometry.faces.bytesPerIndex == 2 ? Int(buffer.load(as: UInt16.self)) : Int(buffer.load(as: UInt32.self))
        let vertex = geometry.vertices.buffer.contents().advanced(by: geometry.vertices.offset + index * geometry.vertices.stride).assumingMemoryBound(to: Float.self)
        let world = anchor.transform * SIMD4(vertex[0], vertex[1], vertex[2], 1)
        triangle.append(local(SIMD3(world.x, world.y, world.z)))
      }
      // Keep only fully enclosed triangles; never fill unseen holes or invent edges.
      if triangle.allSatisfy({ inside($0) }) { points.append(contentsOf: triangle) }
    }
    return points
  }
  private func refreshMeshes() {
    guard let frame = ar.session.currentFrame, let origin else { return }
    var count = 0
    for anchor in frame.anchors.compactMap({ $0 as? ARMeshAnchor }) {
      let vertices = triangles(anchor); count += vertices.count / 3
      let node = meshNodes[anchor.identifier] ?? SCNNode()
      if vertices.isEmpty { node.geometry = nil } else {
        let source = SCNGeometrySource(vertices: vertices.map { SCNVector3($0.x, $0.y, $0.z) })
        let element = SCNGeometryElement(indices: (0..<vertices.count).map { Int32($0) }, primitiveType: .triangles)
        let geometry = SCNGeometry(sources: [source], elements: [element])
        geometry.firstMaterial?.diffuse.contents = UIColor.systemMint
        geometry.firstMaterial?.lightingModel = .constant
        geometry.firstMaterial?.fillMode = .lines
        geometry.firstMaterial?.isDoubleSided = true
        node.geometry = geometry
      }
      node.simdTransform = origin
      if node.parent == nil { ar.scene.rootNode.addChildNode(node) }
      meshNodes[anchor.identifier] = node
    }
    let ids = Set(frame.anchors.map { $0.identifier })
    for id in Array(meshNodes.keys) where !ids.contains(id) { meshNodes.removeValue(forKey: id)?.removeFromParentNode() }
    finish.isEnabled = count > 0 && trackingReady
    status.text = "\(count) triangles · Walk slowly around the counter.\nYellow box = capture region. Reset to reposition."
  }
  private var lastRefresh: TimeInterval = 0
  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    if case .normal = frame.camera.trackingState { trackingReady = true } else {
      trackingReady = false; finish.isEnabled = false
      status.text = "Tracking is limited. Move slowly in good light."
      return
    }
    if frame.timestamp - lastRefresh > 0.6 {
      lastRefresh = frame.timestamp
      if origin == nil { status.text = "Tap the CENTER of the countertop to place the capture region." }
      refreshMeshes()
    }
  }
  func session(_ session: ARSession, didFailWithError error: Error) { close(.failure(error)) }
  func sessionWasInterrupted(_ session: ARSession) { trackingReady = false; finish.isEnabled = false; status.text = "Scan interrupted. Reset to begin again." }
  func sessionInterruptionEnded(_ session: ARSession) { resetScan() }
  @objc private func save() {
    guard !ended, trackingReady, origin != nil, let frame = ar.session.currentFrame else { return }
    ar.session.pause(); finish.isEnabled = false
    // Copy Metal-backed mesh data before leaving the session callback queue.
    let points = frame.anchors.compactMap { $0 as? ARMeshAnchor }.flatMap { triangles($0) }
    guard !points.isEmpty else {
      status.text = "No mesh in this region. Reset and try again."
      if let configuration = ar.session.configuration { ar.session.run(configuration) }
      return
    }
    status.text = "Saving 3D object…"
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let id = UUID().uuidString
        let url = try ScanStore.file(id, "obj")
        try FileManager.default.createDirectory(at: ScanStore.directory, withIntermediateDirectories: true)
        var obj = "# Countertop LiDAR scan\n# Units: meters. Y up. Origin: selected surface center.\no Countertop\n"
        for p in points { obj += "v \(p.x) \(p.y) \(p.z)\n" }
        for index in stride(from: 1, through: points.count, by: 3) { obj += "f \(index) \(index + 1) \(index + 2)\n" }
        try obj.write(to: url, atomically: true, encoding: .utf8)
        let record: [String: Any] = ["id": id, "name": "Countertop", "date": ISO8601DateFormatter().string(from: Date()), "triangles": points.count / 3, "uri": url.absoluteString]
        do {
          try JSONSerialization.data(withJSONObject: record).write(to: ScanStore.file(id, "json"), options: .atomic)
        } catch { try? FileManager.default.removeItem(at: url); throw error }
        DispatchQueue.main.async { self.close(.success(record)) }
      } catch { DispatchQueue.main.async { self.close(.failure(error)) } }
    }
  }
  private func close(_ result: Result<[String: Any]?, Error>) {
    guard !ended else { return }; ended = true; ar.session.pause()
    dismiss(animated: true) { self.completion(result) }
  }
}
