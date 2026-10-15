import { pathToFileURLsetFocusRequest((previous) => ({ ...selection, nonce: (previous?.nonce ?? 0) + 1 }));
  };
  useEffect(() => { setDiagramHistory({ past: [], future: [] }); setReorganizeOpen(false); setEditorTab("dbml");setLookupRequest(null); setVisibilityPreview(null); }, [projectPath]);
  useEffect(() => { if (narrow && drawerOpen) drawerClose.current?.focus(); }, [narrow, drawerOpen]);
  const closeDrawer = (): void => {
    setDrawerOpen(false);
    inspectorTrigger.current?.focus();
  };
  useEffect(() => bridge.subscribeToDisplayMode?.(setDisplayMode), [bridge]);
  useEffect(() => {
    const measure = (): void => setNarrow((root.current?.getBoundingClientRect().width || window.innerWidth) < 900);
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const toggleDisplay = async (): Promise<void> => {
    const next = displayMode === "inline" ? "fullscreen" : "inline";
    setDisplayPending(true);
    setDisplayMessage("");
    try { await bridge.requestDisplayMode(next); setDisplayMode(next); }
    catch { setDisplayMessage("Ce mode d’affichage est indisponible. Votre travail est conservé."); }
    finally { setDisplayPending(false); }
  };
  const selectedTable = session.graph?.tables.find((table) => table.id === selectedId);
  const editorWidth = panels.editorCollapsed ? 40 : clamp(panels.editor);
  const inspectorVisible = narrow ? drawerOpen : !panels.inspectorCollapsed;
  const invalid = session.diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const semanticInvalid=semanticDiagnostics.some(d=>d.severity==="error");
  const constructionLabel=session.presentation.model?.profile.mode==="sharepoint"?"SharePoint":session.presentation.model?.profile.mode==="dataverse"?"Dataverse":"Construction";
  const toggleEditor=(tab:typeof editorTab)=>{setEditorTab(tab);updatePanels({editorCollapsed:tab===editorTab?!panels.editorCollapsed:false});};

  return <main ref={root} className="workbench" data-mode={displayMode} data-narrow={narrow} onKeyDownCapture={(event) => {
    if (!(event.ctrlKey || event.metaKey) || !(event.target instanceof Element) || !event.target.closest(".flow-canvas")) return;
    if (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") { event.preventDefault(); event.stopPropagation(); travelDiagram(event.shiftKey || event.key.toLowerCase() === "y"); }
  }}>
    <header className="workbench-toolbar">
      <strong title={projectPath}>{projectPath}</strong>
      <span className="project-mode" title="Type fixé à la création du projet">{modeLabel(session.presentation.model?.profile)}{session.presentation.model?.profile.mode==="sql"?` · ${session.presentation.model.profile.dialect}`:""}</span>
      <span role="status">{readOnly ? "Lecture seule" : session.saving ? "Enregistrement…" : session.dirty ? "Modifications non enregistrées" : "Enregistré"}</span>
      <span>{session.validating ? "Validation…" : invalid ? "DBML invalide" : "DBML valide"}</span>
      <button type="button" disabled={readOnly || !!session.conflict || !session.dirty || session.saving || session.validating || invalid || semanticInvalid} onClick={() => void session.save()} title="Enregistrer" aria-label="Enregistrer"><ActionIcon name="save" /><span className="action-label">Enregistrer</span></button>
      {bridge.saveCopy && <button disabled={copyPending || session.validating || invalid} onClick={() => { setCopyPending(true); void bridge.saveCopy!({ sourceText: session.source, presentation: session.presentation }).catch(error => setDisplayMessage(error instanceof Error ? error.message : "Copie impossible.")).finally(() => setCopyPending(false)); }} title="Enregistrer une copie" aria-label="Enregistrer une copie"><ActionIcon name="copy" /><span className="action-label">Enregistrer une copie</span></button>}
      <button type="button" disabled={readOnly || historyBusy || session.saving || !!session.conflict || !diagramHistory.past.length} onClick={() => void travelDiagram(false)} title="Annuler le diagramme ou la construction" aria-label="Annuler le diagramme"><ActionIcon name="undo" /><span className="action-label">Annuler</span></button>
      <button type="button" disabled={readOnly || historyBusy || session.saving || !!session.conflict || !diagramHistory.future.length} onClick={() => void travelDiagram(true)} title="Rétablir le diagramme ou la construction" aria-label="Rétablir le diagramme"><ActionIcon name="redo" /><span className="action-label">Rétablir</span></button>
      <label className="name-display">Noms <select aria-label="Noms du diagramme" value={session.presentation.nameDisplay??"display"} onChange={e=>changeDiagram({...session.presentation,nameDisplay:e.target.value as "display"|"technical"|"both"})} disabled={readOnly}><option value="display">Affichés</option><option value="technical">Techniques</option><option value="both">Les deux</option></select></label>
      <button type="button" disabled={readOnly || !session.graph} onClick={() => setReorganizeOpen(true)} title="Réorganiser" aria-label="Réorganiser"><ActionIcon name="layout" /><span className="action-label">Réorganiser</span></button>
      <button ref={historyTrigger} type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)} title="Historique" aria-label="Historique"><ActionIcon name="history" /><span className="action-label">Historique</span></button>
      <button ref={inspectorTrigger} type="button" aria-expanded={inspectorVisible}
        title={inspectorVisible ? "Masquer les vues" : "Afficher les vues"} aria-label={inspectorVisible ? "Masquer les vues" : "Afficher les vues"} onClick={() => narrow ? setDrawerOpen(true) : updatePanels({ inspectorCollapsed: !panels.inspectorCollapsed })}>
        <ActionIcon name="views" /><span className="action-label">{narrow || panels.inspectorCollapsed ? "Afficher les vues" : "Masquer les vues"}</span>
      </button>
      <button type="button" disabled={displayPending} title={displayMode === "inline" ? "Plein écran" : "Quitter le plein écran"} aria-label={displayMode === "inline" ? "Plein écran" : "Quitter le plein écran"} onClick={() => void toggleDisplay()}><ActionIcon name="fullscreen" /><span className="action-label">{displayMode === "inline" ? "Plein écran" : "Quitter le plein écran"}</span></button>
    </header>
    <SessionRecoveryPanel session={session} />
    {reorganizeOpen && <section role="dialog" aria-label="Réorganisation du diagramme"><p>Remplacer les positions et routages de la vue courante ? Cette action peut être annulée.</p>
      <button type="button" onClick={() => {
        if (!session.graph || readOnly) return;
        const current = session.presentation.views[session.presentation.activeViewId]!;
        let next = setNodePositions(session.presentation, session.presentation.activeViewId,
          session.graph.tables.filter((table) => (current.system || current.nodes[table.id]) && !current.nodes[table.id]?.hidden)
            .map((table, index) => ({ id: table.id, position: defaultPosition(index) })));
        next = structuredClone(next); next.views[next.activeViewId]!.edges = {};
        changeDiagram(next); setReorganizeOpen(false);
      }}>Confirmer la réorganisation</button><button type="button" onClick={() => setReorganizeOpen(false)}>Annuler</button></section>}
    {session.error && <p role="alert" className="workbench-message">{session.error}</p>}
    {displayMessage && <p role="status" className="workbench-message">{displayMessage}</p>}
    {semanticDiagnostics.length>0&&<ul className="diagnostics" aria-label="Contrôles du modèle">{semanticDiagnostics.map((d,i)=><li key={i}>{d.message}</li>)}</ul>}
    {historyOpen && <HistoryPanel session={session} bridge={bridge} projectPath={projectPath} readOnly={readOnly}
      onClose={() => { setHistoryOpen(false); historyTrigger.current?.focus(); }} />}
    <section className="workbench-body">
      <section role="region" aria-label="Éditeur DBML" className="editor-panel" style={{ width: editorWidth } as CSSProperties}>
        <nav className="editor-rail" aria-label="Éditeurs du schéma"><button type="button" className="editor-toggle" aria-expanded={!panels.editorCollapsed&&editorTab==="dbml"} aria-pressed={!panels.editorCollapsed&&editorTab==="dbml"}
          aria-label={panels.editorCollapsed ? "Afficher l’éditeur" : "Réduire l’éditeur"}
          onClick={() => toggleEditor("dbml")}><span>DBML</span></button><button className="editor-toggle" type="button" aria-label={`Éditeur ${constructionLabel}`} aria-pressed={!panels.editorCollapsed&&editorTab==="builder"} aria-expanded={!panels.editorCollapsed&&editorTab==="builder"} onClick={()=>toggleEditor("builder")}><span>{constructionLabel}</span></button></nav>
        <div className="editor-content" hidden={panels.editorCollapsed}>
          <div className="dbml-pane" hidden={editorTab!=="dbml"}>
          <DbmlEditor value={session.source} diagnostics={session.diagnostics} readOnly={readOnly} onChange={session.setSource} onSave={() => void session.save()}
            selectionRequest={sourceRequest} onSelectionChange={(offset) => { const selection = session.graph && entityAtOffset(session.graph, offset); if (selection) focusDiagram(selection); }} />
          {session.diagnostics.length > 0 && <ul className="diagnostics" aria-label="Diagnostics">{session.diagnostics.map((diagnostic, index) => <li key={index}>
            {diagnostic.location ? `L${diagnostic.location.start.line}:${diagnostic.location.start.column} — ` : ""}{diagnostic.message}
          </li>)}</ul>}
          </div>
          {session.graph&&<div hidden={editorTab!=="builder"}><SchemaBuilder source={session.source} presentation={session.presentation} graph={session.graph} bridge={bridge} projectPath={projectPath} selection={selectedEntity}
            onSelection={selection=>{setSelectedEntity(selection);setSelectedId(selection.tableId);setSelectedIds([selection.tableId]);setFocusRequest(previous=>({...selection,nonce:(previous?.nonce??0)+1}));}}
            onDocument={changeSchema} invalid={invalid} validating={session.validating} readOnly={readOnly||!!session.conflict||session.saving} onCorrect={()=>{setEditorTab("dbml");updatePanels({editorCollapsed:false});}} lookupRequest={lookupRequest}/></div>}
        </div>
      </section>
      {!panels.editorCollapsed && <PanelSeparator region="editor" width={clamp(panels.editor)} onChange={(editor) => updatePanels({ editor })} />}
      {graph ? <DiagramCanvas graph={graph} presentation={displayedPresentation} onPresentationChange={next => changeDiagram(withoutVisibilityPreview(next, session.presentation, visibilityPreview))} onSelectionChange={id=>{setSelectedId(id);if(editorTab==="builder"&&id)setSelectedEntity({kind:"table",id,tableId:id});}}
        onEntitySelect={(selection) => void selectSource(selection)} selectedEntity={selectedEntity}
        source={session.source} onSourceChange={session.setSource} onQueryChange={setQuery} onReorganize={() => setReorganizeOpen(true)}
        onSelectedTablesChange={setSelectedIds} query={query} focusRequest={focusRequest} readOnly={readOnly}
        onCreateLookup={readOnly||invalid||session.validating||!!session.conflict?undefined:(tableId,columnId,targetTableId)=>{setEditorTab("builder");updatePanels({editorCollapsed:false});setSelectedEntity({kind:columnId?"column":"table",id:columnId??tableId,tableId});setLookupRequest(previous=>({tableId,...(columnId?{columnId}:{}),targetTableId,nonce:(previous?.nonce??0)+1}));}} />
        : <div className="flow-canvas empty-canvas">Corrigez le DBML pour afficher le diagramme.</div>}
      {<>
        {inspectorVisible && !narrow && <PanelSeparator region="inspector" width={clamp(panels.inspector)} onChange={(inspector) => updatePanels({ inspector })} />}
        <aside hidden={!inspectorVisible} role={narrow ? "dialog" : "region"} aria-label="Vues" className={`inspector-panel${narrow ? " inspector-drawer" : ""}`}
          style={{ width: clamp(panels.inspector) }} onKeyDown={(event) => {
            if (event.key === "Escape" && narrow) { event.preventDefault(); event.stopPropagation(); closeDrawer(); }
          }}>
          <header><h2>Vues</h2>{narrow && <button ref={drawerClose} type="button" onClick={closeDrawer}>Fermer les vues</button>}</header>
          {session.graph && <ViewInspector key={projectPath} graph={session.graph} presentation={session.presentation} source={session.source} selectedIds={selectedIds} query={query}
            navigationRef={viewNavigation} onVisibilityPreview={setVisibilityPreview} onQueryChange={setQuery} onSelectTable={(id) => {
              const selection: EntitySelection = { kind: "table", id, tableId: id };
              setSelectedEntity(selection); setSelectedId(id); setSelectedIds([id]);
              let next = session.presentation;
              for (const [groupId, group] of Object.entries(next.views[next.activeViewId]!.groups))
                if (group.collapsed && group.tableIds.includes(id)) next = updateGroup(next, next.activeViewId, groupId, { collapsed: false });
              if (next !== session.presentation) changeDiagram(next);
              setFocusRequest(previous => ({ ...selection, nonce: (previous?.nonce ?? 0) + 1 }));
            }}
            onPresentationChange={changeDiagram} onSourceChange={(value) => { sourceOperation.current = true; session.setSource(value); }} readOnly={readOnly} />}
        </aside>
      </>}
    </section>
  </main>;
}
