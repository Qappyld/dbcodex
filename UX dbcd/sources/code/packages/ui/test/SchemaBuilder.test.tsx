// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SchemaBuilder } from "../src/SchemaBuilder.js";
import { parseDbml } from "../../core/src/dbml-adapter.js";
import { newProjectTemplate } from "../../core/src/project-template.js";
import type { ModelDocument } from "../src/model-commands.js";
import type { EntitySelection } from "../src/source-navigation.js";
import { addTable } from "../src/model-commands.js";
afterEach(cleanup);
let result:ModelDocument;
const host={callTool:vi.fn(async(_name:string,args:Record<string,unknown>)=>({structuredContent:parseDbml(String(args.sourceText),"demo.dbcd")})),requestDisplayMode:vi.fn()};
function Wrapper({invalid=false,readOnly=false}:{invalid?:boolean;readOnly?:boolean}){const template=newProjectTemplate({mode:"sharepoint"});const [doc,setDoc]=useState(()=>{let doc={source:template.sourceText,presentation:template.presentation};doc=addTable(doc,parseDbml(doc.source,"demo.dbcd").graph!,"Clients","list");return addTable(doc,parseDbml(doc.source,"demo.dbcd").graph!,"Commandes","list");});const [selection,setSelection]=useState<EntitySelection|null>({kind:"table",id:"public.Commandes",tableId:"public.Commandes"});result=doc;
  return <SchemaBuilder {...doc} graph={parseDbml(doc.source,"demo.dbcd").graph!} bridge={host} projectPath="demo.dbcd" selection={selection} onSelection={setSelection} onDocument={setDoc} onCorrect={()=>{}} invalid={invalid} readOnly={readOnly}/>;
}
describe("Construction form",()=>{
  it("filters navigation without changing the selected object and clears with Escape",()=>{
    render(<Wrapper/>);
    const search=screen.getByRole("searchbox",{name:"Rechercher une table ou une colonne"});
    fireEvent.change(search,{target:{value:"Clients"}});
    expect(screen.queryByRole("button",{name:"Commandes Liste"})).toBeNull();
    expect(screen.getByRole("button",{name:"Clients Liste"})).toBeTruthy();
    expect(screen.getByLabelText("Nom affiché")).toHaveProperty("value","Commandes");
    fireEvent.change(search,{target:{value:"introuvable"}});
    expect(screen.getByRole("status").textContent).toContain("Aucune table ni colonne");
    fireEvent.keyDown(search,{key:"Escape"});
    expect(screen.getByRole("button",{name:"Commandes Liste"})).toBeTruthy();
  });
  it("creates an existing-table Lookup and applies metadata immediately",async()=>{render(<Wrapper/>);fireEvent.click(screen.getByRole("button",{name:"+ Lookup"}));fireEvent.change(screen.getByLabelText("Nom affiché"),{target:{value:"Client"}});fireEvent.change(screen.getByLabelText("Table cible"),{target:{value:"public.Clients"}});fireEvent.click(screen.getByRole("button",{name:"Créer",exact:true}));await waitFor(()=>expect(result.presentation.model?.tables["public.Commandes"]?.columns.Client?.lookup?.targetTableId).toBe("public.Clients"));
    fireEvent.change(screen.getByLabelText("Nom affiché"),{target:{value:"Acheteur"}});expect(result.presentation.model?.tables["public.Commandes"]?.columns.Client?.displayName).toBe("Acheteur");fireEvent.click(screen.getByLabelText("Autoriser plusieurs valeurs"));await waitFor(()=>expect(result.presentation.model?.tables["public.Commandes"]?.columns.Client?.lookup?.multiple).toBe(true));
    fireEvent.change(screen.getByLabelText("Nom interne"),{target:{value:"Customer"}});fireEvent.blur(screen.getByLabelText("Nom interne"));await waitFor(()=>expect(result.source).toContain('"Customer"'));
    fireEvent.change(screen.getByLabelText("Type",{selector:"select"}),{target:{value:"Text"}});await waitFor(()=>expect(parseDbml(result.source,"demo.dbcd").graph?.relations).toHaveLength(0));expect(result.presentation.model?.tables["public.Commandes"]?.columns.Customer?.lookup).toBeUndefined();
  });
  it("switches an existing column to Lookup without creating a duplicate",async()=>{render(<Wrapper/>);fireEvent.click(screen.getByRole("button",{name:"+ Colonne"}));fireEvent.change(screen.getByLabelText("Nom affiché"),{target:{value:"Contact"}});fireEvent.click(screen.getByRole("button",{name:"Créer",exact:true}));await waitFor(()=>expect(screen.getByLabelText("Nom interne")).toBeTruthy());const before=parseDbml(result.source,"demo.dbcd").graph!.tables.find(t=>t.name==="Commandes")!.columns.length;
    fireEvent.click(screen.getByRole("button",{name:"Relier à une table…"}));fireEvent.change(screen.getByLabelText("Table cible"),{target:{value:"public.Clients"}});fireEvent.click(screen.getByRole("button",{name:"Créer",exact:true}));await waitFor(()=>expect(result.presentation.model?.tables["public.Commandes"]?.columns.Contact?.lookup).toBeTruthy());expect(parseDbml(result.source,"demo.dbcd").graph!.tables.find(t=>t.name==="Commandes")!.columns).toHaveLength(before);
  });
  it("keeps system fields collapsed and blocks writes on invalid DBML",()=>{render(<Wrapper invalid/>);expect(screen.getByText(/dernière structure valide/)).toBeTruthy();expect(screen.getByRole("button",{name:"+ Liste"})).toHaveProperty("disabled",true);const details=screen.getAllByText("Colonnes système")[0]!.closest("details")!;expect(details.open).toBe(false);});
});
